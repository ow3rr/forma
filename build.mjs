// Собирает автономную версию для GitHub Pages: index.html (обёртка вокруг forma.html), иконку, manifest и service worker.
// forma.html остаётся исходником (он же публикуется артефактом в claude.ai).
import fs from 'node:fs';
import zlib from 'node:zlib';

const src = fs.readFileSync('forma.html', 'utf8');

const head = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Форма">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#f2f5f3">
<meta name="color-scheme" content="light dark">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon.png">
<link rel="icon" href="icon.png">
<style>
html{color-scheme:light}
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,sans-serif}
[hidden]{display:none!important}
</style>
</head>
<body>
`;
const tail = `
<script>
// вне claude.ai: просим браузер не стирать данные и ставим офлайн-кэш
if (!window.claude) {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
</script>
</body>
</html>
`;
fs.writeFileSync('index.html', head + src + tail);

fs.writeFileSync('manifest.webmanifest', JSON.stringify({
  name: 'Форма — дневник тренировок', short_name: 'Форма', lang: 'ru', start_url: './', scope: './', display: 'standalone',
  background_color: '#f2f5f3', theme_color: '#d4440c',
  icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }]
}, null, 2));

// service worker: сеть в приоритете, при её отсутствии отдаём кэш (зал часто без связи)
fs.writeFileSync('sw.js', `const C='forma-v1',FILES=['./','index.html','manifest.webmanifest','icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok&&new URL(e.request.url).origin===location.origin){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))))});
`);

// иконка 512×512: оранжевый фон и белая штанга
const N = 512, px = Buffer.alloc(N * N * 4);
const set = (x, y, c) => { const i = (y * N + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c); };
rect(0, 0, N, N, [212, 68, 12]);
const W = [255, 255, 255];
rect(120, 244, 392, 268, W);          // гриф
rect(96, 172, 136, 340, W);           // внутренние блины
rect(376, 172, 416, 340, W);
rect(56, 204, 96, 308, W);            // внешние блины
rect(416, 204, 456, 308, W);
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync('icon.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('built index.html', fs.statSync('index.html').size, 'bytes');
