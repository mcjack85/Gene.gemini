// 유전자 분석 플랫폼 백엔드
// 역할: ① Gemini API 키를 서버에 숨기고 대신 호출 (/api/analyze)
//       ② PWA 프론트엔드(public 폴더) 정적 호스팅
//
// ⚠️ 2단계(로그인 + 상담사별 DB)는 Supabase 연동 시 이 파일에
//    인증 미들웨어와 저장 라우트를 추가하면 됩니다. (README 참고)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// ── 시스템 지시문: 상담 리포트 품질을 일관되게 고정 ──────────────
const SYSTEM_INSTRUCTION = `당신은 유전자 검사 결과를 일반인이 이해하기 쉽게 설명하는 '전문 유전 건강 상담 어시스턴트'입니다.
보험·건강 상담사가 고객에게 설명하는 자리에서 쓰는 리포트를 작성합니다.

[작성 원칙]
1. 반드시 한국어로, 신뢰감 있고 따뜻한 전문가 어조로 작성합니다.
2. 유전자 검사는 '확진'이 아니라 '발병 감수성(위험도)'임을 전제로 하고, 단정적 진단·공포 조성 표현은 피합니다.
3. 요청된 표는 반드시 GitHub 마크다운 표(| 머리글 | ... | 와 |---| 구분선)로 작성합니다. 표 안 문장은 간결하게.
4. 제공된 유전자·유전자형 데이터에만 근거해 설명하고, 없는 수치나 과장된 효능을 지어내지 않습니다.
5. 변이는 '이형접합(주의)'과 '동형접합(고위험)'의 의미 차이를 구분해 설명합니다.
6. 영양제·생활습관은 타깃 유전자와 작용 기전을 함께 적어 근거를 보여줍니다.
7. 보험 설계: 프롬프트에 "등록 상품 후보" 목록이 주어지면 반드시 그 목록 안의 상품만 추천하고, 목록에 없는 상품명·보험사·보험료·수치는 절대 지어내지 않습니다. 목록이 없으면 특정 상품명 없이 일반적 담보 유형과 권장 방향만 설명합니다. 최종 가입 권유는 등록된 설계사의 판단임을 전제로 합니다.
8. 리포트 맨 끝에 한 줄로 다음 고지를 넣습니다:
   "※ 본 리포트는 의학적 진단이 아닌 건강관리 참고용이며, 정확한 진단·치료는 의료기관 상담이 필요합니다."
9. 섹션 제목은 ## 또는 ### 로, 핵심어는 굵게 강조해 가독성을 높입니다.`;

// Supabase (선택): 설정하면 로그인한 사용자만 /api/analyze 사용 가능
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Supabase JWT 검증 → 유효하면 user 반환, 아니면 null
async function verifySupabaseToken(authHeader) {
  if (!AUTH_ENABLED) return { ok: true, user: null }; // 1단계 모드: 검증 생략
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false };
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return { ok: false };
    const user = await r.json();
    return user?.id ? { ok: true, user } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// 프론트/백엔드를 다른 도메인에 배포할 때만 CORS 필요.
// 같은 서버에서 호스팅하면 ALLOWED_ORIGIN 미설정이어도 동작합니다.
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

// 정적 프론트엔드 호스팅 (../public)
app.use(express.static(path.join(__dirname, "..", "public")));

// 헬스 체크
app.get("/api/health", (req, res) => {
  res.json({ ok: true, model: GEMINI_MODEL, keyConfigured: Boolean(GEMINI_API_KEY), authEnabled: AUTH_ENABLED });
});

// ── 핵심: Gemini 분석 호출 ──────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다. server/.env 파일을 확인하세요."
      });
    }

    // 로그인 검증 (Supabase 설정 시) — Gemini 키 남용 방지
    const auth = await verifySupabaseToken(req.headers.authorization);
    if (!auth.ok) {
      return res.status(401).json({ error: "로그인이 필요합니다. 다시 로그인해 주세요." });
    }

    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return res.status(400).json({ error: "유효한 prompt가 필요합니다." });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, topP: 0.95, maxOutputTokens: 8192 }
    });

    // 일시적 과부하(503)/레이트리밋(429)은 짧은 백오프로 자동 재시도.
    // 각 시도는 TIMEOUT_MS 안에 끝나지 않으면 중단(무한 대기 방지).
    const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
    let upstream, errBody = "", timedOut = false;
    const MAX_TRIES = 3;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        upstream = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: ctrl.signal
        });
      } catch (e) {
        if (e.name === "AbortError") { timedOut = true; break; }
        throw e;
      } finally {
        clearTimeout(timer);
      }
      if (upstream.ok) break;
      errBody = await upstream.text().catch(() => "");
      const retriable = upstream.status === 503 || upstream.status === 429;
      if (!retriable || attempt === MAX_TRIES) break;
      console.warn(`[Gemini ${upstream.status}] 재시도 ${attempt}/${MAX_TRIES - 1}...`);
      await new Promise(r => setTimeout(r, 1500 * attempt)); // 1.5s, 3s
    }

    if (timedOut) {
      return res.status(504).json({ error: "AI 응답이 지연되어 시간 초과되었습니다. 잠시 후 다시 시도하거나 변이 항목을 줄여보세요." });
    }
    if (!upstream.ok) {
      console.error("[Gemini 오류]", upstream.status, errBody);
      return res
        .status(502)
        .json({ error: `Gemini API 오류 (${upstream.status})`, detail: errBody.slice(0, 500) });
    }

    const data = await upstream.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

    if (!text) {
      return res.status(502).json({ error: "Gemini가 빈 응답을 반환했습니다.", raw: data });
    }

    // TODO(2단계): 로그인 사용자라면 여기서 상담 결과를 DB에 저장
    res.json({ text, model: GEMINI_MODEL });
  } catch (err) {
    console.error("[analyze 예외]", err);
    res.status(500).json({ error: "서버 내부 오류", detail: String(err?.message || err) });
  }
});

// SPA 폴백 (알 수 없는 경로는 index.html로)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행: http://localhost:${PORT}`);
  console.log(`   모델: ${GEMINI_MODEL} | Gemini 키: ${GEMINI_API_KEY ? "설정됨" : "❌ 미설정 (.env 확인)"} | 로그인 검증: ${AUTH_ENABLED ? "ON" : "OFF(1단계)"}`);
});
