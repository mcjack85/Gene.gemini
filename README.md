# 유전자 분석 플랫폼 (웹 + PWA)

유전자 변이 3단계(정상/이형접합/동형접합)를 체크하면 **Gemini AI가 종합 상담 리포트를 바로 생성**하는 상담사용 플랫폼입니다. 웹 하나로 PC·모바일에서 쓰고, "홈 화면에 추가"로 앱처럼 설치됩니다(PWA).

## 폴더 구조
```
gene-platform/
├─ public/              # 프론트엔드 (PWA) — 기존 HTML 거의 그대로 유지
│  ├─ index.html        # 메인 화면 (유전자 체크 + AI 분석 버튼)
│  ├─ manifest.webmanifest
│  ├─ sw.js             # 서비스워커 (앱 셸만 캐싱, API/데이터는 캐싱 안 함)
│  └─ icons/            # 앱 아이콘
└─ server/              # 백엔드 (Gemini 키 숨김 + 정적 호스팅)
   ├─ server.js
   ├─ package.json
   └─ .env.example      # → .env 로 복사 후 키 입력
```

## 1단계: 지금 바로 실행하기 (로컬)

### 1. Gemini API 키 발급
[Google AI Studio](https://aistudio.google.com/apikey) 접속 → **Get API key** → 키 복사

### 2. 환경변수 설정
`server/.env.example` 을 복사해 `server/.env` 로 저장하고 키를 붙여넣습니다.
```
GEMINI_API_KEY=발급받은_키
```

### 3. 서버 실행
```bash
cd server
npm install
npm start
```
→ 콘솔에 `✅ 서버 실행: http://localhost:3000` 가 뜨면 브라우저에서 접속.

### 4. 사용
유전자 상태를 체크 → 우측 **「AI 분석 실행 (Gemini)」** 클릭 → 결과가 모달에 표처럼 바로 표시됩니다.
- AI 없이 쓰려면 **「간이 시뮬」** 또는 **「프롬프트 복사」** 사용 가능(기존 기능 유지).

> 키가 없거나 서버가 꺼져 있으면 AI 버튼은 친절한 오류 안내를 표시하고, 간이 시뮬/복사로 폴백할 수 있습니다.

---

## 2단계: 로그인 + 상담사별 상담기록 저장 (구현 완료)

코드는 이미 다 들어가 있습니다. **Supabase 설정 3단계**만 하면 켜집니다.
(설정을 비워두면 자동으로 1단계=로그인 없는 모드로 동작합니다.)

### 1. Supabase 프로젝트 생성
[supabase.com](https://supabase.com) → New project → 생성.
`Settings > API` 에서 **Project URL** 과 **anon public key** 복사.

### 2. DB 스키마 실행
Supabase 대시보드 `SQL Editor` 에 **`supabase/schema.sql`** 내용을 붙여넣고 **Run**.
→ `consultations` 테이블 + RLS(상담사별 격리) 정책이 생성됩니다.

### 3. 키 입력 (두 곳)
- **프론트**: `public/config.js` 의 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 채우기
- **백엔드**: `server/.env` 에 같은 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 추가
  (백엔드가 로그인 토큰을 검증해 Gemini 키 남용을 막습니다)

→ 서버 재시작하면 **로그인 화면**이 뜨고, 로그인 후:
- 유전자 체크 → AI 분석 → **「이 결과 저장」** 으로 DB 저장
- 헤더 **「상담기록」** 에서 과거 고객 불러오기/삭제 (본인 것만 보임, RLS 보장)

> 이메일 인증을 끄려면 Supabase `Authentication > Providers > Email` 에서 "Confirm email" 해제(테스트 편의).

---

## ⚠️ 중요: 민감정보·법적 고지
- 유전정보·건강정보는 **개인정보보호법상 민감정보**입니다. 저장 시 **암호화·접근통제·별도 수집동의**가 필요합니다.
- 생성 결과는 **의학적 진단이 아닌 건강관리 참고용**이며 화면에 해당 고지가 표시됩니다.
- **유전정보를 보험 가입·설계에 활용**하는 것은 생명윤리법·보험업법상 제약이 있을 수 있으니, 실제 서비스 전 **법률 전문가 검토**를 권장합니다.

## 배포 옵션
- 한 서버에 통합 배포: Render / Railway / Fly.io 등에 `server` 실행(정적까지 서빙)
- 프론트/백엔드 분리: 프론트 Vercel·Netlify, 백엔드 별도 → `public/index.html`의 `API_BASE`를 백엔드 주소로 변경
