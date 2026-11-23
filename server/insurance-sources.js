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
async function readPages(path, params, fetcher) {
  const rows = [];
  let total;
  for (let page = 1; ; page++) {
    const url = new URL(path, PORTAL);
    url.search = new URLSearchParams({ ...params, resultType: "json", pageNo: String(page), numOfRows: "100" });
    const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("외부 API 응답 오류");
    const data = await response.json();
    const { header, body } = data.response ?? data;
    if (page === 1 && ["03", "003"].includes(String(header?.resultCode))) return [];
    if (!["00", "0000", "0", "000"].includes(String(header?.resultCode))) throw new Error("외부 API 결과 코드 오류");
    const count = Number(body?.totalCount);
    if (body?.totalCount == null || !Number.isSafeInteger(count) || count < 0 || (total != null && count !== total)) {
      throw new Error("전체 건수 확인 실패");
    }
    total = count;
    const item = body.items?.item ?? body.items;
    const items = Array.isArray(item) ? item : item && typeof item === "object" && Object.keys(item).length ? [item] : [];
    if (body.pageNo != null && Number(body.pageNo) !== page) throw new Error("페이지 번호 불일치");
    rows.push(...items);
    if (rows.length === total) return rows;
    if (!items.length || rows.length > total) throw new Error("페이지 누락");
  }
}

async function loadProtected(key, now, fetcher) {
  const products = new Map();
  for (const sector of ["생명보험", "손해보험"]) {
    const rows = await readPages(KDIC, { ServiceKey: key, regnNm: sector }, fetcher);
    if (!rows.length) throw new Error("권역 자료 미게시");
    for (const row of rows) {
      const insurer = clean(row.fnclstNm ?? row.fncIstNm);
      const name = clean(row.prdNm);
      if (!insurer || !name) throw new Error("상품 식별 필드 누락");
      const registered = date(row.regDate);
      const stopped = date(row.prdSalDscnDt);
      const type = clean(row.prdPttn);
      const id = identifier(["kdic", sector, insurer, name, type, registered, stopped]);
      products.set(id, { id, source: "kdic", insurer, name, type, registered, stopped, sector });
    }
  }
  return [...products.values()];
}

function premium(raw) {
  const value = clean(raw).replaceAll(",", "");
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

async function loadMedical(key, now, fetcher) {
  // A dated batch avoids mixing today's data with earlier observations of the same product.
  const koreaDay = now.getTime() + 9 * 3600000;
  for (let daysAgo = 0; daysAgo <= 14; daysAgo++) {
    const day = new Date(koreaDay - daysAgo * 86400000).toISOString().slice(0, 10);
    const rows = await readPages(MEDICAL, { serviceKey: key, basDt: day.replaceAll("-", "") }, fetcher);
    if (!rows.length) continue;
    const products = new Map();
    for (const row of rows) {
      const insurer = clean(row.cmpyNm);
      const name = clean(row.prdNm);
      const type = clean(row.ptrn);
      if (!insurer || !name || date(row.basDt) !== day) throw new Error("기준일 또는 상품 식별 필드 불일치");
      const id = identifier(["medical", clean(row.ofrInstNm), clean(row.cmpyCd), insurer, name, type]);
      if (!products.has(id)) products.set(id, { id, source: "medical", insurer, name, type, asOf: day, rates: [] });
      products.get(id).rates.push({ coverage: clean(row.mog), age: clean(row.age), male: premium(row.mlInsRt), female: premium(row.fmlInsRt) });
    }
    return [...products.values()];
  }
  throw new Error("최근 실손 공시자료 미게시");
}
