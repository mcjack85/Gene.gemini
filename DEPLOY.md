# 배포 가이드

외부(인터넷)에서 접속 가능한 주소로 올리는 방법입니다. 민감정보(키)는 **코드에 넣지 않고** 각 플랫폼의 환경변수에 입력합니다.

> ⚠️ 유전·건강정보를 다루는 서비스입니다. 실서비스로 배포하기 전 **HTTPS 적용(대부분 플랫폼 기본 제공)**, **개인정보 처리방침/동의**, **접근권한 관리**를 반드시 점검하세요.

---

## 방법 A. Render (추천 · 무료 · GitHub 연동)

1. **GitHub에 올리기**
   ```bash
   cd C:\Users\mcjac\gene-platform
   git init && git add . && git commit -m "init: gene platform"
   # GitHub에서 빈 저장소 생성 후:
   git remote add origin https://github.com/<내계정>/gene-platform.git
   git branch -M main && git push -u origin main
   ```
2. [render.com](https://render.com) 가입 → **New ▸ Blueprint** → 방금 올린 저장소 선택
   - 루트의 `render.yaml` 을 자동 인식합니다.
3. 배포 설정에서 **환경변수 입력**:
   - `GEMINI_API_KEY` = 발급받은 Gemini 키 (필수)
   - (2단계 쓸 때) `SUPABASE_URL`, `SUPABASE_ANON_KEY`
4. **Create** → 몇 분 뒤 `https://gene-platform-xxxx.onrender.com` 발급. 끝.

> 무료 플랜은 일정 시간 미사용 시 잠들었다가 첫 요청에 수십 초 깨어나는 특성이 있습니다. 상시 가동이 필요하면 유료 플랜 또는 Railway를 쓰세요.

---

## 방법 B. Railway (GitHub 없이 CLI로 바로)

```bash
npm i -g @railway/cli
railway login
cd C:\Users\mcjac\gene-platform
railway init
railway up
```
- 대시보드에서 **Root Directory = `server`**, 환경변수 `GEMINI_API_KEY` 등을 설정.

---

## 방법 C. Docker (어디서나 동일)

저장소에 `Dockerfile` 이 있습니다. Docker를 지원하는 어떤 호스팅(Fly.io, Cloud Run, 자체 서버)에서도 그대로 빌드됩니다.
```bash
docker build -t gene-platform .
docker run -p 3000:3000 -e GEMINI_API_KEY=... gene-platform
```

---

## 프론트/백엔드를 따로 배포하는 경우
기본은 한 서버가 프론트까지 서빙하므로 `public/config.js` 의 `API_BASE` 는 `""` 로 둡니다.
프론트(Vercel/Netlify)와 백엔드를 **다른 도메인**에 둘 때만:
- `public/config.js` 의 `API_BASE` 를 백엔드 주소로
- 백엔드 `.env`(또는 환경변수) 에 `ALLOWED_ORIGIN` = 프론트 도메인
## 보험 공시 조회 설정

Render 서비스의 **Environment**에서 `DATA_GO_KR_SERVICE_KEY`에 공공데이터포털 일반 인증키(Decoding)를 등록합니다. 같은 계정에서 [예금보험공사 예금자보호 금융상품](https://www.data.go.kr/data/3037352/openapi.do)과 [금융위원회 실손보험정보](https://www.data.go.kr/data/15094797/openapi.do)의 활용을 각각 신청하세요.

서버가 시작될 때 처음 수집하고, 이후 실행 중에는 매일 한국 시간 오후 1시 10분이 지난 뒤 다시 수집합니다. Render 무료 서비스가 쉬고 있으면 다음 실행 시 갱신합니다. 출처별로 마지막 페이지까지 성공한 자료를 검색에 반영합니다. 화면에서 공시 기준일·등록일과 수집 시간을 구별해 확인할 수 있습니다.

재시작 후에도 마지막 성공 자료를 보관하려면 서버 환경변수 `INSURANCE_DATABASE_URL`에 PostgreSQL 연결 문자열을 등록하세요. 기존 Supabase 프로젝트에서는 **Connect → Session pooler**의 연결 문자열을 사용할 수 있습니다. 서버의 DB 계정은 첫 실행 시 `insurance_catalog` 스키마와 `snapshots` 테이블을 생성할 권한이 필요합니다. 연결 문자열은 서버에만 저장하세요. DB를 설정하지 않으면 실행 중에는 메모리에 보관하며, 재시작 후 다시 수집합니다.

확인은 메인 화면의 **보험사별 공시 상품 조회** 또는 **보험상품 관리 → 보험사별 공시 상품 조회**에서 할 수 있습니다. 실손보험은 확인할 담보·가입 연령·성별을 선택하면 공시된 기준 보험료가 표시됩니다. 보호대상 목록은 예금보험공사 등재 범위이며 판매중단일이 비어 있으면 판매 여부를 미확인으로 표시합니다.
