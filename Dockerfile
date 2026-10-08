# 어디서나 동일하게 도는 컨테이너 이미지 (Render/Railway/Fly/Cloud Run 공용)
FROM node:20-alpine

# 앱 루트 = /app/server (server.js 기준 ../public = /app/public)
WORKDIR /app/server

# 의존성 먼저 설치 (캐시 활용)
COPY server/package*.json ./
RUN npm install --omit=dev

# 소스 복사
COPY server/ ./
COPY public/ /app/public/

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
