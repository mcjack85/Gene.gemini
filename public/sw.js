// 서비스워커: 앱 셸(정적 파일)만 캐싱합니다.
// ⚠️ 유전자/상담 데이터와 /api/* 응답은 민감정보이므로 절대 캐싱하지 않습니다.
const CACHE = "gene-platform-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API 호출과 POST 요청은 캐싱/가로채기 금지 (항상 네트워크)
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) {
    return; // 브라우저 기본 네트워크 동작
  }

  // 정적 파일: 캐시 우선, 없으면 네트워크 후 캐시에 저장
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
