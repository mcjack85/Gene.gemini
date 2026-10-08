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
