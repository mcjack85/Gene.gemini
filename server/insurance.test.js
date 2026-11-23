import assert from "node:assert/strict";
import test from "node:test";
import { createCatalog } from "./insurance.js";

// Official response shapes, with invented company names and rates for these tests.
function response(item, page, total = item.length) {
  return Response.json({ response: { header: { resultCode: "00" }, body: {
    totalCount: total, pageNo: page, items: { item }
  } } });
}
const time = Date.parse("2026-11-23T05:00:00Z");
function fixture(url) {
  const p = url.searchParams;
  const page = Number(p.get("pageNo"));
  if (p.has("regnNm")) {
    assert.equal(p.get("ServiceKey"), "test/key+");
    const sector = p.get("regnNm");
    assert.ok(["생보", "손보"].includes(sector));
    return Response.json({ getProductList202607: { header: { resultCode: "00" }, pageNo: page, totalCount: 2,
      item: [{ fncIstNm: "가상" + sector, prdNm: "테스트 상품", regDate: "20260101", prdPttn: "보험", prdSalDscnDt: page === 1 ? "" : "20261020" }] } });
  }
  assert.equal(p.get("serviceKey"), "test/key+");
  assert.ok(p.get("endBasDt") >= "20261123");
  const item = { cmpyNm: "가상손해보험", cmpyCd: "dummy", prdNm: "가상 실손", ptrn: "테스트",
    basDt: "20261031", age: "40", mog: "입원", mlInsRt: "1,234", fmlInsRt: "" };
  if (page === 1) return response([{ ...item, basDt: "20260930" }, { ...item, cmpyNm: "다른회사", basDt: "20260506" }], page, 4);
  return response([item, { ...item, basDt: "20260801" }], page, 4);
}

test("collects both insurance sectors and keeps the most recent published medical conditions", async () => {
  const catalog = createCatalog({ key: "test/key+", clock: () => time, fetcher: fixture });
  await catalog.refresh();
  assert.equal(catalog.state.kdic.status, "ready");
  assert.equal(catalog.state.kdic.products.length, 4);
  assert.equal(new Set(catalog.state.kdic.products.map(p => p.id)).size, 4);
  assert.equal(catalog.state.medical.products.length, 2);
  assert.equal(catalog.state.medical.products[0].asOf, "2026-10-31");
  assert.equal(catalog.state.medical.products[1].asOf, "2026-05-06");
  assert.deepEqual(catalog.state.medical.products[0].rates[0], { coverage: "입원", age: "40", male: 1234, female: null });
});

test("an incomplete refresh preserves the prior collection and retries after the cooldown", async () => {
  let now = time, fail = false, calls = 0;
  const catalog = createCatalog({ key: "test/key+", clock: () => now, fetcher: url => {
    calls++;
    if (fail && url.searchParams.has("regnNm") && url.searchParams.get("pageNo") === "2") return response([], 2, 2);
    return fixture(url);
  } });
  await Promise.all([catalog.refresh(), catalog.refresh()]);
  assert.equal(calls, 6);
  const previous = catalog.state.kdic.products;
  now += 86400000;
  fail = true;
  await catalog.refresh();
  assert.equal(catalog.state.kdic.products, previous);
  assert.equal(catalog.state.kdic.status, "error");
  assert.equal(catalog.state.medical.status, "ready");
  const count = calls;
  await catalog.refresh();
  assert.equal(calls, count);
  fail = false;
  now += 31 * 60000;
  await catalog.refresh();
  assert.equal(catalog.state.kdic.status, "ready");
});

test("missing key exposes an unconfigured state without contacting an upstream service", async () => {
  const catalog = createCatalog({ fetcher: () => assert.fail("unexpected fetch") });
  await catalog.refresh();
  assert.equal(catalog.state.kdic.status, "unconfigured");
  assert.equal(catalog.state.medical.fetchedAt, null);
});
