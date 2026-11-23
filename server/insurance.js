import express from "express";
import { plans, planForDisclosure } from "./insurance-plans.js";
import pg from "pg";
import { PublicationError, sources } from "./insurance-sources.js";

// 13:10 KST marks the next refresh window, after the FSC publication time.
function publicationWindow(time) {
  return Math.floor((time - (4 * 60 + 10) * 60000) / 86400000);
}

export function createCatalog({ key, db, fetcher = fetch, clock = Date.now }) {
  const state = Object.fromEntries(Object.keys(sources).map(id => [id, {
    products: [], fetchedAt: null, status: key ? "loading" : "unconfigured", retryAfter: 0
  }]));
  let running;
  let restored = false;
  function adopt(id, time, products) {
    const items = products.sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? "") || a.insurer.localeCompare(b.insurer, "ko") || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
    Object.assign(state[id], { fetchedAt: new Date(time).toISOString(), products: items, status: key ? "ready" : "unconfigured" });
  }
  async function restore() {
    await db.query("CREATE SCHEMA IF NOT EXISTS insurance_catalog");
    await db.query(`CREATE TABLE IF NOT EXISTS insurance_catalog.snapshots (
      source text PRIMARY KEY, fetched_at timestamptz NOT NULL, products jsonb NOT NULL
    )`);
    const { rows } = await db.query("SELECT source, fetched_at, products FROM insurance_catalog.snapshots");
    for (const row of rows) {
      if (Object.hasOwn(state, row.source)) adopt(row.source, row.fetched_at, row.products);
    }
    restored = true;
  }
  async function update(id) {
    const entry = state[id];
    const now = clock();
    if (!key || now < entry.retryAfter || (entry.fetchedAt && publicationWindow(Date.parse(entry.fetchedAt)) >= publicationWindow(now))) return;
    entry.status = "loading";
    try {
      const products = await sources[id].load(key, new Date(now), fetcher);
      if (db) {
        const result = await db.query(`INSERT INTO insurance_catalog.snapshots (source, fetched_at, products)
          VALUES ($1, $2, $3::jsonb) ON CONFLICT (source) DO UPDATE
          SET fetched_at = EXCLUDED.fetched_at, products = EXCLUDED.products
          WHERE insurance_catalog.snapshots.fetched_at < EXCLUDED.fetched_at RETURNING fetched_at`,
          [id, new Date(now).toISOString(), JSON.stringify(products)]);
        if (!result.rowCount) {
          const { rows } = await db.query("SELECT fetched_at, products FROM insurance_catalog.snapshots WHERE source = $1", [id]);
          adopt(id, rows[0].fetched_at, rows[0].products);
          return;
        }
      }
      adopt(id, now, products);
    } catch (error) {
      entry.status = "error";
      entry.retryAfter = clock() + 30 * 60000;
      console.warn("[보험 공시] 수집 실패:", id, error instanceof PublicationError ? error.message : "자료 처리 또는 저장 오류");
    }
  }
  async function sync() {
    if (db && !restored) await restore();
    await Promise.all(Object.keys(sources).map(update));
  }
  function refresh() {
    running ??= sync().catch(() => {
      for (const entry of Object.values(state)) entry.status = "error";
      console.warn("[보험 공시] 저장소 연결 실패");
    }).finally(() => { running = null; });
    return running;
  }
  return { state, refresh };
}

export function createInsuranceRouter(catalog, verify) {
  const router = express.Router();
  const coverageIndex = new WeakMap();
  function medicalCoverages(products) {
    if (!coverageIndex.has(products)) {
      const names = new Set();
      const byName = new Map();
      for (const p of products) {
        for (const raw of new Set(p.rates.map(r => r.coverage))) {
          const name = raw?.trim();
          if (!name) continue;
          names.add(name);
          if (!byName.has(name)) byName.set(name, new Set());
          byName.get(name).add(p.id);
        }
      }
      coverageIndex.set(products, { options: [...names].sort((a,b) => a.localeCompare(b, "ko")), byName });
    }
    return coverageIndex.get(products);
  }
  router.use(async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!(await verify(req.headers.authorization)).ok) return res.status(401).json({ error: "로그인 후 다시 조회해 주세요." });
    next();
  });
  router.get("/plans", (_req, res) => res.json({ plans }));
  router.get("/products", (req, res) => {
    const { source = "kdic", insurer = "", q = "", coverage = "", page = "1" } = req.query;
    if ([source, insurer, q, page, coverage].some(v => typeof v !== "string" || v.length > 160) || !Object.hasOwn(sources, source) || (coverage && source !== "medical")
      || !/^[1-9]\d{0,6}$/.test(page)) return res.status(400).json({ error: "검색 조건을 확인해 주세요." });
    const { products, fetchedAt, status } = catalog.state[source];
    const simplify = value => value.replace(/\s+/g, "").toLowerCase();
    const needle = simplify(q);
    const index = source === "medical" ? medicalCoverages(products) : null;
    const matches = products.filter(p => (!insurer || p.insurer === insurer) && simplify(p.name).includes(needle)
      && (!coverage || index.byName.get(coverage)?.has(p.id)));
    const offset = (Number(page) - 1) * 20;
    res.json({
      status, fetchedAt, sourceName: sources[source].label, sourceUrl: sources[source].url,
      coverages: index?.options,
      insurers: [...new Set(products.map(p => p.insurer))].sort((a, b) => a.localeCompare(b, "ko")),
      total: matches.length, page: Number(page), pageSize: 20,
      products: matches.slice(offset, offset + 20).map(({ rates, ...product }) => product)
    });
  });
  router.get("/products/:id", (req, res) => {
    for (const [id, entry] of Object.entries(catalog.state)) {
      const product = entry.products.find(p => p.id === req.params.id);
      if (product) return res.json({ product, planId: product.stopped ? null : planForDisclosure.get(product.id) || null,
        fetchedAt: entry.fetchedAt, sourceUrl: sources[id].url, sourceName: sources[id].label });
    }
    res.status(404).json({ error: "상품 목록이 변경되었습니다. 다시 검색해 주세요." });
  });
  return router;
}

export function mountInsurance(app, verify) {
  const connectionString = process.env.INSURANCE_DATABASE_URL;
  const db = connectionString ? new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000 }) : null;
  db?.on("error", () => console.warn("[보험 공시] 저장소 연결이 끊겼습니다."));
  const catalog = createCatalog({ key: process.env.DATA_GO_KR_SERVICE_KEY, db });
  app.use("/api/insurance", createInsuranceRouter(catalog, verify));
  catalog.refresh();
  setInterval(catalog.refresh, 5 * 60000).unref();
}
