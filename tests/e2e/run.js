/**
 * Teste ponta a ponta da versão web (modo local, sem Supabase).
 * Uso: npm run test:e2e   (gera o build web em dist/ se não existir)
 * Variáveis: CHROMIUM_PATH (executável do Chromium), E2E_SHOTS (pasta para capturas).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const handler = require('serve-handler');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
let BASE = '';
const S = process.env.E2E_SHOTS || path.join(ROOT, 'tests', 'e2e', 'screenshots');

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    execSync('npx expo export --platform web --output-dir dist', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CI: '1' } });
  }
  fs.mkdirSync(S, { recursive: true });
  const server = http.createServer((req, res) => handler(req, res, { public: DIST, rewrites: [{ source: '**', destination: '/index.html' }] }));
  await new Promise((r) => server.listen(Number(process.env.E2E_PORT || 0), r));
  BASE = `http://localhost:${server.address().port}`;
  try {
    await flow();
  } finally {
    server.close();
  }
}

async function flow() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: `${S}/e2e-${n}.png` });
  const click = async (text, opts = {}) => { await page.getByText(text, { exact: true, ...opts }).first().click(); await page.waitForTimeout(400); };
  const fill = async (label, value) => { await page.getByLabel(label, { exact: true }).first().fill(value); };
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await shot('fail-' + name.replace(/\W+/g, '_')); throw e; } };

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await step('onboarding consentimento', async () => {
    await page.getByRole('switch').first().click();
    await click('Continuar');
  });
  await step('dados corporais', async () => {
    await fill('Nome', 'Ana Teste');
    await fill('Data de nascimento', '19/10/1986');
    await click('Feminino');
    await fill('Altura', '165');
    await fill('Peso atual', '80');
    await fill('Peso desejado (opcional)', '70');
    await shot('01-dados');
    await click('Continuar');
  });
  await step('objetivo', async () => {
    await click('Emagrecimento');
    await click('Levemente ativo');
    await page.getByRole('switch').first().click();
    await click('Continuar');
  });
  await step('etapas opcionais', async () => {
    await click('Continuar (opcional)');
    await click('Continuar (opcional)');
    await click('Continuar (opcional)');
    await page.waitForTimeout(300);
    await shot('02-metas');
    const body = await page.innerText('body');
    if (!/Mifflin/.test(body)) throw new Error('explicação das metas ausente');
    await click('Concluir');
    await page.waitForTimeout(1500);
  });
  await step('dashboard sem registros', async () => {
    const body = await page.innerText('body');
    if (!/Sem registros/.test(body)) throw new Error('não mostra "Sem registros"');
    if (!/Nenhuma refeição registrada hoje/.test(body)) throw new Error('não informa ausência de refeições');
    await shot('03-dashboard-vazio');
  });
  await step('água +250 ml', async () => {
    await page.getByLabel('Adicionar 250 mililitros de água').click();
    await page.waitForTimeout(700);
    const body = await page.innerText('body');
    if (!/Faltam 2,55 L/.test(body)) throw new Error('restante incorreto: ' + (body.match(/Faltam [^\n]+/g) || []).join(' | '));
  });
  await step('refeição por frase', async () => {
    await page.getByLabel('Registro rápido').click();
    await page.waitForTimeout(400);
    await click('Descrever o que comi');
    await fill('Descreva o que você comeu', 'Comi um pão francês com dois ovos mexidos e café sem açúcar');
    await click('Interpretar');
    await page.waitForTimeout(500);
    await shot('04-frase');
    const body = await page.innerText('body');
    for (const t of ['Pão, trigo, francês', 'Ovo, de galinha, inteiro, cru', 'Café, infusão 10%', 'manteiga, óleo ou azeite']) if (!body.includes(t)) throw new Error('faltou ' + t);
    await click('Adicionar 3 item(ns)');
    await page.waitForTimeout(800);
  });
  await step('diário mostra itens', async () => {
    await page.goto(BASE + '/alimentacao', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    if (!body.includes('Pão, trigo, francês')) throw new Error('item não aparece no diário');
    await shot('05-diario');
  });
  await step('persistência após recarregar', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const body = await page.innerText('body');
    if (/Etapa 1 de 7/.test(body)) throw new Error('voltou para o onboarding');
    if (!/Faltam 2,55 L/.test(body)) throw new Error('água não persistiu');
    if (/Sem registros\n/.test(body.split('Água')[0] || '')) throw new Error('proteína sem registro após recarregar');
    await shot('06-dashboard');
  });
  await step('assistente local', async () => {
    await page.goto(BASE + '/assistente', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await click('Quanto de proteína falta hoje?');
    await page.waitForTimeout(800);
    const body = await page.innerText('body');
    if (!/Faltam aproximadamente \d+ g/.test(body)) throw new Error('resposta local ausente');
    await shot('07-assistente');
  });
  await step('evolução e peso', async () => {
    await page.goto(BASE + '/peso', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await fill('Peso', '79,4');
    await click('Registrar');
    await page.waitForTimeout(1200);
    await page.goto(BASE + '/evolucao', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    if (!/79,4 kg/.test(body)) throw new Error('peso não aparece');
    await shot('08-evolucao');
  });
  await step('avaliação manual e comparação', async () => {
    for (const [date, fat, pct, smm] of [['01/08/2026', '30', '37,5', '26'], ['01/10/2026', '27', '34', '26,1']]) {
      await page.goto(BASE + '/composicao/nova', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      await fill('Data original do exame', date);
      await fill('Peso', '80');
      await fill('Massa de gordura', fat);
      await fill('Percentual de gordura', pct);
      await fill('Massa muscular esquelética', smm);
      await click('Confirmar e salvar');
      await page.waitForTimeout(1200);
    }
    const body = await page.innerText('body');
    if (!/Análise numérica/.test(body) || !/−3,00 kg/.test(body)) throw new Error('comparação ausente: ' + body.slice(0, 300));
    await shot('09-comparacao');
  });
  await step('suplemento de vitamina B12 sem alterar macros', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const before = (await page.innerText('body')).match(/Calorias\n([^\n]+)/)?.[1];
    await page.goto(BASE + '/alimento/novo?supplement=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await fill('Nome do produto', 'Vitamina B12');
    await click('Vitamina ou mineral isolado');
    await click('Adicionar composto');
    await fill('Composto', 'Vitamina B12');
    await fill('Quantidade', '2500');
    await click('mcg');
    await shot('12-b12-cadastro');
    await click('Salvar alimento');
    await page.waitForTimeout(800);
    await page.goto(BASE + '/adicionar?tab=frase&meal=breakfast', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await fill('Descreva o que você comeu', 'Vit B12 2500mcg');
    await click('Interpretar');
    await page.waitForTimeout(500);
    const parsed = await page.innerText('body');
    if (!parsed.includes('Vitamina B12')) throw new Error('B12 não reconhecida na frase');
    await click('Adicionar 1 item(ns)');
    await page.waitForTimeout(800);
    await page.goto(BASE + '/suplementos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const sup = await page.innerText('body');
    if (!/Vitamina B12 2\.500 mcg/.test(sup)) throw new Error('composto não aparece: ' + sup.slice(0, 300));
    await shot('13-b12-suplementos');
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const after = (await page.innerText('body')).match(/Calorias\n([^\n]+)/)?.[1];
    if (before !== after) throw new Error(`macros mudaram: ${before} -> ${after}`);
  });
  await step('resposta colada de IA externa', async () => {
    await page.goto(BASE + '/adicionar?tab=frase&meal=lunch', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await fill('Descreva o que você comeu', 'arroz, feijão e bife');
    await click('Interpretar com outra IA');
    const answer = 'Aqui está:\n```json\n{"items":[{"text":"arroz","food_query":"arroz branco","quantity":4,"unit":"colher de sopa","preparation":null,"notes":[]},{"text":"bife","food_query":"bife","quantity":1,"unit":"bife","preparation":"grelhado","notes":[],"energy_kcal":999}],"questions":[],"meal":"lunch"}\n```';
    await fill('Resposta da IA', answer);
    await page.getByText('Interpretar', { exact: true }).last().click();
    await page.waitForTimeout(600);
    const body = await page.innerText('body');
    if (!body.includes('Arroz, tipo 1, cozido') || !body.includes('Carne, bovina, patinho')) throw new Error('itens da IA externa não aparecem');
    if (body.includes('999 kcal')) throw new Error('usou caloria vinda da IA externa');
    await shot('14-ia-externa');
  });
  await step('telas secundárias abrem', async () => {
    for (const r of ['agua', 'suplementos', 'receitas', 'receita', 'metas', 'perfil', 'notificacoes', 'privacidade', 'relatorios', 'dieta', 'atividade', 'fontes', 'atividades', 'alimento/novo', 'adicionar']) {
      await page.goto(BASE + '/' + r, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      const body = await page.innerText('body');
      if (/Unmatched|This screen doesn't exist|Something went wrong/i.test(body)) throw new Error('rota com problema: ' + r);
    }
    await page.goto(BASE + '/dieta', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await click('Gerar proposta orientativa');
    await page.waitForTimeout(800);
    await shot('10-proposta');
    await page.goto(BASE + '/relatorios', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot('11-relatorio');
  });
  await browser.close();
  if (errors.length) throw new Error('Erros no console: ' + JSON.stringify(errors.slice(0, 10)));
  console.log('Fluxo E2E concluído sem erros.');
}

main().catch((e) => {
  console.log('ABORT', e.message.split('\n')[0]);
  process.exit(1);
});
