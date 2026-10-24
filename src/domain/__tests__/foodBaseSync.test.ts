/**
 * Arquivos em dados/alimentos/ (planilhas CSV ou pacotes JSON exportados pelo app)
 * alimentam a base do sistema src/data/reference/alimentos-base.json.
 * Atualizar: npm run base:atualizar  (o workflow de publicação também roda).
 */
import fs from 'fs';
import path from 'path';
import { buildFoodBundle, parseFoodBundle, parseFoodFile } from '../foodBundle';
import type { Food } from '../types';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'dados/alimentos');
const BASE = path.join(ROOT, 'src/data/reference/alimentos-base.json');

function sourceFiles(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /\.(csv|json)$/i.test(f) && !f.startsWith('_')).sort();
}

describe('dados/alimentos → base do sistema', () => {
  const problems: string[] = [];
  const incoming: Food[] = [];
  for (const f of sourceFiles()) {
    const r = parseFoodFile(fs.readFileSync(path.join(DIR, f), 'utf8'));
    problems.push(...r.errors.map((e) => `${f}, linha ${e.line}: ${e.message}`));
    incoming.push(...r.foods);
  }

  it('os arquivos de dados/alimentos são válidos', () => {
    expect(problems).toEqual([]);
  });

  it('a base inclui todos os alimentos de dados/alimentos', () => {
    const current = parseFoodBundle(fs.readFileSync(BASE, 'utf8')).foods;
    const next = buildFoodBundle(current, incoming);
    // compara na forma lida (mesma ordem de campos), para não acusar diferença à toa
    const changed = JSON.stringify(parseFoodBundle(JSON.stringify(next)).foods) !== JSON.stringify(current);
    if (process.env.UPDATE_FOOD_BASE && changed) {
      fs.writeFileSync(BASE, JSON.stringify({ ...next, alimentos: parseFoodBundle(JSON.stringify(next)).foods }, null, 2) + '\n');
      console.log(`alimentos-base.json atualizado: ${next.alimentos.length} alimento(s) (antes ${current.length}).`);
      return;
    }
    if (changed) throw new Error('alimentos-base.json desatualizado: rode "npm run base:atualizar".');
  });
});
