import { createHash } from "node:crypto";

const PORTAL = "https://apis.data.go.kr/";
const KDIC = "B190017/service/GetInsuredProductService202607/getProductList202607";
const MEDICAL = "1160100/service/GetMedicalReimbursementInsuranceInfoService/getInsuranceInfo";

export const sources = {
  kdic: { label: "예금보험공사 보호대상 상품", url: "https://www.data.go.kr/data/3037352/openapi.do", load: loadProtected },
  medical: { label: "금융위원회 실손보험", url: "https://www.data.go.kr/data/15094797/openapi.do", load: loadMedical }
};

const clean = value => String(value ?? "").trim();
function date(value) {
  const match = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(clean(value));
  if (!match || match[1] === "0000" || match[1] === "9999") return null;
  return match.slice(1).join("-");
}

function identifier(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

// Publish only complete pages for one collection. Keep API keys out of error messages.
export class PublicationError extends Error {}

async function* readPages(path, params, fetcher) {
  let received = 0;
  let total;
  for (let page = 1; ; page++) {
    const url = new URL(path, PORTAL);
    url.search = new URLSearchParams({ ...params, resultType: "json", pageNo: String(page), numOfRows: "5000" });
    let response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(60000) });
    } catch {
      throw new PublicationError("API 연결 실패, 페이지 " + page);
    }
    if (!response.ok) throw new PublicationError("HTTP " + response.status + ", 페이지 " + page);
    const data = await response.json().catch(() => { throw new PublicationError("JSON 응답 아님"); });
    const envelope = data.getProductList202607 ?? data.response ?? data;
    const body = envelope.body ?? envelope;
    const code = String(envelope.header?.resultCode);
    if (page === 1 && ["03", "003"].includes(code)) return;
    if (!["00", "0000", "0", "000"].includes(code)) {
      throw new PublicationError("외부 API 결과 코드 " + (/^\d{1,5}$/.test(code) ? code : "미확인"));
    }
    const count = Number(body?.totalCount);
    if (body?.totalCount == null || !Number.isSafeInteger(count) || count < 0 || (total != null && count !== total)) {
      throw new PublicationError("전체 건수 확인 실패");
    }
    total = count;
    const item = body.item ?? body.items?.item ?? body.items;
    const items = Array.isArray(item) ? item : item && typeof item === "object" && Object.keys(item).length ? [item] : [];
    if (body.pageNo != null && Number(body.pageNo) !== page) throw new PublicationError("페이지 번호 불일치");
    received += items.length;
    if (received > total || (!items.length && received < total)) throw new PublicationError("페이지 누락");
    if (items.length) yield items;
    if (received === total) return;
  }
}

async function loadProtected(key, now, fetcher) {
  const products = new Map();
  for (const [regnNm, sector] of [["생보", "생명보험"], ["손보", "손해보험"]]) {
    const previousSize = products.size;
    for await (const rows of readPages(KDIC, { ServiceKey: key, regnNm }, fetcher)) {
      for (const row of rows) {
        const insurer = clean(row.fncIstNm ?? row.fnclstNm);
        const name = clean(row.prdNm);
        if (!insurer || !name) throw new PublicationError("상품 식별 필드 누락");
        const registered = date(row.regDate);
        const stopped = date(row.prdSalDscnDt);
        const type = clean(row.prdPttn);
        const id = identifier(["kdic", sector, insurer, name, type, registered, stopped]);
        products.set(id, { id, source: "kdic", insurer, name, type, registered, stopped, sector });
      }
    }
    if (products.size === previousSize) throw new PublicationError("보험 권역 자료 미게시");
  }
  return [...products.values()];
}

function premium(raw) {
  const value = clean(raw).replaceAll(",", "");
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

async function loadMedical(key, now, fetcher) {
  // Insurers and individual products publish on different dates. A single common date omits most of them.
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const products = new Map();
  for await (const rows of readPages(MEDICAL, { serviceKey: key, endBasDt: today.replaceAll("-", "") }, fetcher)) {
    for (const row of rows) {
      const insurer = clean(row.cmpyNm);
      const name = clean(row.prdNm);
      const type = clean(row.ptrn);
      const day = date(row.basDt);
      if (!insurer || !name || !day || day > today) throw new PublicationError("기준일 또는 상품 식별 필드 불일치");
      const id = identifier(["medical", clean(row.ofrInstNm), clean(row.cmpyCd), insurer, name, type]);
      const previous = products.get(id);
      if (previous && previous.asOf > day) continue;
      if (!previous || previous.asOf < day) {
        products.set(id, { id, source: "medical", insurer, name, type, asOf: day, rates: [] });
      }
      products.get(id).rates.push({ coverage: clean(row.mog), age: clean(row.age), male: premium(row.mlInsRt), female: premium(row.fmlInsRt) });
    }
  }
  if (!products.size) throw new PublicationError("실손 공시자료 미게시");
  return [...products.values()];
}
