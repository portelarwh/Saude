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
    execSync('npm run export:web', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CI: '1' } });
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
  await step('LGPD não volta ao reabrir', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    if (/Autorizo o tratamento/.test(body) || !(await page.getByLabel('Nome', { exact: true }).count())) throw new Error('consentimento pedido de novo ao reabrir');
  });
  await step('dados corporais', async () => {
    await fill('Nome', 'Ana Teste');
    await page.getByLabel('Data de nascimento', { exact: true }).pressSequentially('19101986');
    const birth = await page.getByLabel('Data de nascimento', { exact: true }).inputValue();
    if (birth !== '19/10/1986') throw new Error('máscara de data: ' + birth);
    await click('Feminino');
    await fill('Altura (cm)', '1,65');
    await fill('Peso atual', '80');
    const height = await page.getByLabel('Altura (cm)', { exact: true }).inputValue();
    if (height !== '165') throw new Error('altura em metros não convertida: ' + height);
    await fill('Peso desejado (opcional)', '70');
    await shot('01-dados');
    await click('Continuar');
  });
  await step('objetivo', async () => {
    await click('Emagrecimento');
    await click('Ganho de massa muscular');
    if (!/seguem: Recomposição corporal/.test(await page.innerText('body'))) throw new Error('combinação de objetivos ausente');
    await click('Levemente ativo');
    await fill('Treinos de força por semana', '4');
    await fill('Duração (min)', '60');
    await page.waitForTimeout(300);
    if (!/Nível de atividade abaixo do seu treino/.test(await page.innerText('body'))) throw new Error('sem aviso de atividade x treino');
    await click('Usar "Moderadamente ativo"');
    if (/Nível de atividade abaixo do seu treino/.test(await page.innerText('body'))) throw new Error('sugestão de atividade não aplicada');
    const soon = new Date(Date.now() + 21 * 864e5);
    const pad = (n) => String(n).padStart(2, '0');
    await page.getByLabel('Prazo desejado (opcional)', { exact: true }).pressSequentially(`${pad(soon.getDate())}${pad(soon.getMonth() + 1)}${soon.getFullYear()}`);
    if (!/Prazo recomendado: \d{2}\/\d{2}\/\d{4}/.test(await page.innerText('body'))) throw new Error('prazo recomendado ausente');
    await page.getByText(/^Usar prazo recomendado/).first().click();
    await page.waitForTimeout(300);
    if (!/dentro de uma faixa considerada sustentável/.test(await page.innerText('body'))) throw new Error('prazo recomendado não aplicado');
    await click('Continuar');
  });
  await step('etapas opcionais', async () => {
    await page.getByLabel('Acordo às', { exact: true }).fill('');
    await page.getByLabel('Acordo às', { exact: true }).pressSequentially('630');
    await page.getByLabel('Durmo às', { exact: true }).fill('');
    await page.getByLabel('Durmo às', { exact: true }).pressSequentially('2300');
    await page.getByLabel('Almoço', { exact: true }).pressSequentially('1230');
    await page.getByLabel('Durmo às', { exact: true }).click();
    const wake = await page.getByLabel('Acordo às', { exact: true }).inputValue();
    const lunch = await page.getByLabel('Almoço', { exact: true }).inputValue();
    if (wake !== '06:30' || lunch !== '12:30') throw new Error(`hora sem dois-pontos: ${wake} / ${lunch}`);
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
  await step('app reaberto em nova aba vai direto ao painel', async () => {
    const again = await ctx.newPage();
    await again.goto(BASE + '/', { waitUntil: 'networkidle' });
    await again.waitForTimeout(1500);
    const body = await again.innerText('body');
    await again.close();
    if (/Autorizo o tratamento|Bem-vindo ao Meu Equilíbrio/.test(body) || !/kcal para hoje|kcal restantes/.test(body)) throw new Error('cadastro reaparece ao abrir de novo: ' + body.slice(0, 300).replace(/\n/g, ' '));
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
    // 30 ml/kg × 80 kg = 2,4 L − 250 ml
    if (!/Faltam 2,15 L/.test(body)) throw new Error('restante incorreto: ' + (body.match(/Faltam [^\n]+/g) || []).join(' | '));
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
    if (!/Faltam 2,15 L/.test(body)) throw new Error('água não persistiu');
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
    const heroLabel = () => page.locator('[aria-label^="Calorias:"]').first().getAttribute('aria-label');
    const before = await heroLabel();
    if (!before) throw new Error('cartão de calorias não encontrado');
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
    const after = await heroLabel();
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
  await step('colar refeição e rótulo do agente externo', async () => {
    const meal = { formato: 'meu-equilibrio/v1', tipo: 'refeicao', nome: 'Almoço do agente', refeicao: 'almoco', itens: [
      { alimento: 'arroz branco cozido', quantidade_g: 100, medida: '4 colheres de sopa' },
      { alimento: 'peito de frango grelhado', quantidade_g: 120, nutrientes_estimados: { kcal: 999 } },
      { alimento: 'molho especial da casa', quantidade_g: 20, nutrientes_estimados: { kcal: 40, proteina_g: 0.5, carboidrato_g: 3, gordura_g: 3 } },
    ] };
    const label = { formato: 'meu-equilibrio/v1', tipo: 'rotulo', produto: 'Iogurte Proteico Teste', marca: 'Marca', porcao: 170, unidade: 'g', medida_caseira: '1 pote', base: 'vendido', por_porcao: { kcal: 119, proteina_g: 15, carboidrato_g: 9.4, gordura_g: 2.4, sodio_mg: 85 } };
    await page.goto(BASE + '/colar', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await click('Ver formato');
    if (!(await page.innerText('body')).includes('"tipo": "rotulo"')) throw new Error('formato não exibido');
    await fill('Resposta do agente', 'Segue:\n```json\n' + JSON.stringify([meal, label]) + '\n```');
    await click('Ler');
    await page.waitForTimeout(600);
    const body = await page.innerText('body');
    if (!body.includes('Arroz, tipo 1, cozido') || !body.includes('Frango, peito, sem pele, grelhado')) throw new Error('itens não associados à TACO');
    if (!body.includes('estimativa da IA externa')) throw new Error('estimativa não sinalizada');
    if (body.includes('999')) throw new Error('usou caloria do agente para alimento da base');
    await shot('15-colar-agente');
    await click('Salvar e registrar agora');
    await page.waitForTimeout(800);
    await click('Conferir e salvar alimento');
    await page.waitForTimeout(1000);
    await click('Salvar alimento');
    await page.waitForTimeout(1000);
    await page.goto(BASE + '/refeicoes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const saved = await page.innerText('body');
    if (!saved.includes('Almoço do agente') || !saved.includes('contém estimativas da IA')) throw new Error('refeição salva não aparece');
    await shot('16-refeicoes');
    await page.goto(BASE + '/adicionar?meal=lunch', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await fill('Pesquisar alimento', 'iogurte proteico');
    await page.waitForTimeout(500);
    if (!(await page.innerText('body')).includes('Iogurte Proteico Teste')) throw new Error('rótulo colado não foi salvo como alimento');
  });
  await step('painel e progresso com dados', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    for (const t of ['Proteína', 'Carboidratos', 'Gorduras', 'Água', 'Refeições', 'Café da manhã', 'Resumo']) if (!body.includes(t)) throw new Error('painel sem ' + t);
    await page.screenshot({ path: `${S}/e2e-20-inicio.png`, fullPage: true });
    await page.goto(BASE + '/progresso', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const prog = await page.innerText('body');
    for (const t of ['Calorias por dia', 'Proteína por dia', 'Distribuição das calorias', 'Água por dia']) if (!prog.includes(t)) throw new Error('progresso sem ' + t);
    await page.screenshot({ path: `${S}/e2e-21-progresso.png`, fullPage: true });
    await page.goto(BASE + '/alimentacao', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${S}/e2e-22-diario.png`, fullPage: true });
  });
  await step('como você está: retenção, creatina e água', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await click('Retenção de líquido');
    await page.waitForTimeout(600);
    await click('forte');
    await click('Registrar');
    await page.waitForTimeout(600);
    let body = await page.innerText('body');
    if (!/Registrado/.test(body) || !/Procure atendimento se tiver/.test(body) || !/uma perna só/.test(body) || !/O que ajuda/.test(body)) throw new Error('tela de retenção');
    await shot('16-retencao');
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    if (!/Hoje: Retenção de líquido \(forte\)/.test(await page.innerText('body'))) throw new Error('registro do dia não aparece no Início');
    await page.goto(BASE + '/suplementos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await click('Ver a fase de saturação (opcional)');
    body = await page.innerText('body');
    if (!/Creatina: como usar/.test(body) || !/3–5 g por dia/.test(body) || !/20 g\/dia/.test(body)) throw new Error('guia de creatina');
    await page.goto(BASE + '/agua', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    if (!/Dicas de hidratação/.test(await page.innerText('body'))) throw new Error('dicas de hidratação');
  });
  await step('instalável como PWA', async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
    const manifest = await (await page.request.get(BASE + manifestHref)).json();
    if (manifest.display !== 'standalone' || !manifest.icons.some((i) => i.sizes === '512x512')) throw new Error('manifesto incompleto');
    const icon = await page.request.get(new URL(manifest.icons[0].src, BASE + manifestHref).toString());
    if (!icon.ok()) throw new Error('ícone do manifesto não encontrado');
    const sw = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? null);
    if (!sw || !sw.endsWith('/sw.js')) throw new Error('service worker não ativo');
    const build = await page.getAttribute('meta[name="app-build"]', 'content');
    const v = await (await page.request.get(BASE + '/versao.json')).json();
    if (!build || v.build !== build) throw new Error('versao.json não corresponde ao build');
    // critérios de instalação do próprio Chrome (o contexto de teste conta como anônimo)
    const cdp = await ctx.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    const blocking = installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
    if (blocking.length) throw new Error('não instalável: ' + JSON.stringify(blocking));
    if (manifest.id !== '/') throw new Error('id do app deve ser o caminho do app, recebido ' + manifest.id);
  });
  await step('calculadora: base e fator da proteína em Metas', async () => {
    await page.goto(BASE + '/metas', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const read = async () => {
      await page.waitForTimeout(1000);
      const body = await page.innerText('body');
      const g = (label) => Number((body.match(new RegExp(label + '\\s+([\\d.]+) (?:g|kcal)')) || [])[1]?.replace('.', '') ?? NaN);
      return { body, p: g('Proteínas'), kcal: g('Calorias'), fat: g('Gorduras'), carb: g('Carboidratos') };
    };
    const closes = (r) => Math.abs(r.p * 4 + r.fat * 9 + r.carb * 4 - r.kcal) <= 5;
    let r = await read();
    if (!/Padrão de proteína/.test(r.body) || !/Padrão do app para o seu objetivo: 2,0 g\/kg/.test(r.body)) throw new Error('card de padrão de proteína');
    // Ana: 79,4 kg, 165 cm (IMC 29,2 → peso atual), peso-alvo 70 kg, recomposição com treino → 2,0 g/kg
    const steps = [
      [null, Math.round(2.0 * 79.4)],
      [/^Peso-alvo 70 kg/, 140],
      ['2,2 g/kg', 154],
      [/^Peso atual 79,4 kg/, Math.round(2.2 * 79.4)],
      ['1,6 g/kg', Math.round(1.6 * 79.4)],
      ['Padrão do app', Math.round(2.0 * 79.4)],
    ];
    for (const [chip, expected] of steps) {
      if (chip) {
        if (typeof chip === 'string') await click(chip);
        else await page.getByText(chip).first().click();
        r = await read();
      }
      if (r.p !== expected) throw new Error(`${chip}: proteína esperada ${expected} g, veio ${r.p}`);
      if (!closes(r)) throw new Error(`${chip}: macros não fecham (${r.p}/${r.fat}/${r.carb} vs ${r.kcal})`);
    }
    if (/\d\.\d kg|IMC \d+\.\d/.test(r.body)) throw new Error('número com ponto decimal no texto');
    await shot('17-metas-proteina');

    // IMC ≥ 30 (como o perfil real): 114,3 kg em 1,65 m → peso de referência = IMC 25 (68,1 kg)
    await page.goto(BASE + '/perfil', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await fill('Peso atual', '114,3');
    await fill('Peso desejado', '75');
    await click('Salvar perfil');
    await page.waitForTimeout(1200);
    await page.goto(BASE + '/metas', { waitUntil: 'networkidle' });
    r = await read();
    if (!/Peso de referência \(IMC 25\) 68,1 kg/.test(r.body)) throw new Error('obesidade: chip do peso de referência ausente');
    if (r.p !== Math.round(2.0 * 68.1)) throw new Error(`obesidade: esperado ${Math.round(2.0 * 68.1)} g, veio ${r.p}`);
    if (/Peso atual 114/.test(r.body)) throw new Error('obesidade: peso total não pode ser oferecido como base');
    await page.getByText(/^Peso-alvo 75 kg/).first().click();
    r = await read();
    if (r.p !== 150 || !closes(r)) throw new Error(`obesidade + peso-alvo: esperado 150 g, veio ${r.p}`);
    await page.getByText(/^Peso de referência \(IMC 25\)/).first().click();
    r = await read();
    if (r.p !== 136) throw new Error(`volta ao peso de referência: esperado 136 g, veio ${r.p}`);
    await shot('18-metas-obesidade');
  });
  await step('versão no topo e "Verificar agora"', async () => {
    const version = fs.readFileSync(path.join(ROOT, 'src/version.ts'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.getByLabel(`Versão ${version}. Ver detalhes da versão`).first().click();
    await page.waitForTimeout(400);
    let body = await page.innerText('body');
    if (!/Sobre a versão/.test(body) || !body.includes(`Versão atual: ${version}`)) throw new Error('pop-up da versão');
    await click('Verificar agora');
    await page.waitForTimeout(1200);
    body = await page.innerText('body');
    if (!/versão mais recente/.test(body)) throw new Error('verificação da versão: ' + body.slice(0, 200));
    await shot('15-versao');
    await click('Fechar');
  });
  await step('aviso de atualização da base', async () => {
    await page.route('**/versao.json*', (route) => route.fulfill({ json: { build: 'novo-build', base_alimentos: { atualizado_em: '2099-01-01T00:00:00Z', total: 42 } } }));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    if (!/Atualizar base de dados/.test(body) || !/42 alimentos novos/.test(body)) throw new Error('aviso de atualização ausente');
    await shot('13-atualizacao');
    await click('Depois');
    await page.unroute('**/versao.json*');
  });
  await step('exportar e importar base de alimentos', async () => {
    await page.goto(BASE + '/base-alimentos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const [download] = await Promise.all([page.waitForEvent('download'), click('Exportar alimentos-base.json')]);
    const file = path.join(S, 'alimentos-base.json');
    await download.saveAs(file);
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (bundle.formato !== 'meu-equilibrio/alimentos-v1') throw new Error('formato inesperado');
    const yog = bundle.alimentos.find((f) => f.name === 'Iogurte Proteico Teste');
    if (!yog || yog.user_id !== null || !yog.id.startsWith('base:')) throw new Error('rótulo salvo ausente na exportação');
    await fill('Ou cole o conteúdo (CSV ou JSON)', JSON.stringify(bundle));
    await click('Ler texto colado');
    let body = await page.innerText('body');
    if (!/0 novo\(s\)/.test(body) || !/já existe\(m\)/.test(body)) throw new Error('reimportação duplicaria alimentos');
    await click('Cancelar');
    await fill('Ou cole o conteúdo (CSV ou JSON)', 'nome;unidade;valores_por;porcao;kcal;proteina_g;fibra_g;tags\nTapioca Teste;g;porcao;50;120;0,1;;\nSem dados;g;;;;;;\nMisto quente caseiro;g;;;260;12;;lanche da tarde\n');
    await click('Ler texto colado');
    body = await page.innerText('body');
    if (!/2 novo\(s\)/.test(body) || !/Linha 3: Sem dados: nenhum valor nutricional/.test(body)) throw new Error('pré-visualização da planilha incorreta');
    if (!/240 kcal/.test(body)) throw new Error('porção não convertida para 100 g');
    await click('Importar 2 alimento(s)');
    await page.waitForTimeout(500);
    if (!/2 alimento\(s\) importado\(s\)/.test(await page.innerText('body'))) throw new Error('importação da planilha falhou');
  });
  await step('busca por grupo, parte do nome e tags', async () => {
    await page.goto(BASE + '/adicionar', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const search = async (q) => { await fill('Pesquisar alimento', q); await page.waitForTimeout(400); return page.innerText('body'); };
    if (!/Misto quente caseiro/.test(await search('sanduiche'))) throw new Error('misto quente não aparece em "sanduiche"');
    if (!/Banana, prata/.test(await search('frut'))) throw new Error('"frut" não trouxe frutas');
    if (!/Banana, prata/.test(await search('baanna'))) throw new Error('erro de digitação não tolerado');
    await shot('14-busca-grupo');
    await page.goto(BASE + '/alimento/novo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await fill('Nome do produto', 'Wrap de frango');
    await page.getByLabel('Adicionar tag', { exact: true }).pressSequentially('pré-treino,');
    await page.waitForTimeout(300);
    const body = await page.innerText('body');
    if (!/pré-treino ✕/.test(body) || !/encontra este alimento por: .*sanduíche/.test(body)) throw new Error('editor de tags');
    await shot('12-base-alimentos');
  });
  await step('exame: enviar arquivo para a IA', async () => {
    await page.goto(BASE + '/composicao/nova', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const body = await page.innerText('body');
    if (!/Escolher exame e enviar para a IA/.test(body) || !/Resposta da IA/.test(body)) throw new Error('envio do exame não está visível');
  });
  await step('sugestão de instalação no celular', async () => {
    const mobile = await browser.newContext({ viewport: { width: 400, height: 860 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
    const p = await mobile.newPage();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    if (!/Instale o Meu Equilíbrio/.test(await p.innerText('body'))) throw new Error('aviso de instalação ausente');
    await p.getByLabel('Agora não', { exact: true }).click();
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(1000);
    if (/Instale o Meu Equilíbrio/.test(await p.innerText('body'))) throw new Error('"agora não" não foi respeitado');
    await mobile.close();
  });
  await step('telas secundárias abrem', async () => {
    for (const r of ['progresso', 'colar', 'refeicoes', 'agua', 'suplementos', 'receitas', 'receita', 'metas', 'perfil', 'notificacoes', 'privacidade', 'relatorios', 'dieta', 'atividade', 'fontes', 'atividades', 'alimento/novo', 'adicionar']) {
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
