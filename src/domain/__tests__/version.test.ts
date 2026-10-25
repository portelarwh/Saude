import fs from 'fs';
import path from 'path';
import { APP_RELEASE_DATE, APP_VERSION } from '../../version';
import { formatReleaseDate, versionCheckResult } from '../appUpdate';

const root = path.resolve(__dirname, '../../..');

describe('versão do app', () => {
  it('src/version.ts, app.json e package.json têm a mesma versão (use npm run version:bump)', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(app.expo.version).toBe(APP_VERSION);
    expect(pkg.version).toBe(APP_VERSION);
    const [ma, mi, pa] = APP_VERSION.split('.').map(Number);
    expect(app.expo.android.versionCode).toBe(ma * 10000 + mi * 100 + pa);
    expect(APP_RELEASE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('"Verificar agora": atual, nova ou sem internet', () => {
    const running = { version: '1.0.0', build: 'abc' };
    expect(versionCheckResult(running, null).status).toBe('offline');
    expect(versionCheckResult(running, { build: 'abc', versao: '1.0.0' }).status).toBe('current');
    const r = versionCheckResult(running, { build: 'def', versao: '1.0.1' });
    expect(r).toMatchObject({ status: 'newer' });
    expect(r.message).toContain('1.0.0 → 1.0.1');
    expect(versionCheckResult(running, { build: 'def', versao: '1.0.0' }).status).toBe('newer'); // mesmo número, build novo
  });

  it('data no formato brasileiro', () => {
    expect(formatReleaseDate('2026-10-25')).toBe('25/10/2026');
    expect(formatReleaseDate(null)).toBe('—');
  });
});
