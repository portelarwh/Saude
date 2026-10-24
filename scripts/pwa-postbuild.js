/**
 * Completa o build web (dist/) para ser instalável como PWA: liga o manifesto,
 * ícones e o service worker no index.html respeitando o caminho base
 * (EXPO_BASE_URL, ex.: /Saude no GitHub Pages) e cria o 404.html das rotas.
 * Uso: node scripts/pwa-postbuild.js [pasta]   (padrão: dist)
 */
const fs = require('fs');
const path = require('path');

const dist = path.resolve(process.argv[2] || 'dist');
const base = (process.env.EXPO_BASE_URL || '').replace(/\/$/, '');
const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

for (const f of ['manifest.webmanifest', 'sw.js', 'icons/icon-192.png']) {
  if (!fs.existsSync(path.join(dist, f))) throw new Error(`dist/${f} ausente: a pasta public/ não foi copiada no build`);
}

const tags = [
  `<link rel="manifest" href="${base}/manifest.webmanifest">`,
  `<link rel="apple-touch-icon" href="${base}/icons/apple-touch-icon.png">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-title" content="Meu Equilíbrio">`,
  `<meta name="description" content="Diário alimentar, água, metas, composição corporal e relatórios.">`,
  `<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${base}/sw.js',{scope:'${base}/'});});}</script>`,
].join('\n    ');

if (!html.includes('rel="manifest"')) html = html.replace('</head>', `    ${tags}\n  </head>`);
fs.writeFileSync(indexPath, html);
fs.copyFileSync(indexPath, path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log(`PWA pronto em ${dist} (base "${base || '/'}")`);
