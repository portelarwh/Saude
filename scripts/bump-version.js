#!/usr/bin/env node
/**
 * Atualiza a versão do app em todos os lugares: src/version.ts (fonte única),
 * app.json (expo.version e android.versionCode) e package.json.
 * Uso: npm run version:bump -- 1.0.1     (sem número: incrementa o último)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const versionFile = path.join(root, 'src/version.ts');
const src = fs.readFileSync(versionFile, 'utf8');
const current = src.match(/APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
const next = process.argv[2] || current.replace(/(\d+)$/, (n) => String(Number(n) + 1));
if (!/^\d+\.\d+\.\d+$/.test(next)) throw new Error(`Versão inválida: ${next} (use X.Y.Z)`);
const today = new Date().toISOString().slice(0, 10);

fs.writeFileSync(versionFile, src.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${next}'`).replace(/APP_RELEASE_DATE = '[^']+'/, `APP_RELEASE_DATE = '${today}'`));

const appJsonPath = path.join(root, 'app.json');
const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
app.expo.version = next;
const [ma, mi, pa] = next.split('.').map(Number);
app.expo.android = { ...app.expo.android, versionCode: ma * 10000 + mi * 100 + pa };
fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n');

const pkgPath = path.join(root, 'package.json');
const pkg = fs.readFileSync(pkgPath, 'utf8');
fs.writeFileSync(pkgPath, pkg.replace(/"version": "[^"]+"/, `"version": "${next}"`));

console.log(`✓ versão ${current} → ${next} (${today})`);
