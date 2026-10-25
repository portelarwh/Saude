# Meu Equilíbrio — Saúde e Nutrição com IA

Aplicativo pessoal (Android-first, também PWA) para emagrecimento saudável com foco em **perda de gordura, preservação de massa muscular, proteína e hidratação** — com metas explicadas, diário alimentar inteligente, suplementos, composição corporal, atividades, planos alimentares, relatórios e um assistente de IA que usa os seus dados reais.

> O app oferece orientações gerais e estimativas. Não faz diagnósticos e não substitui médico ou nutricionista.

## Abrir o app no celular ou no computador

**https://portelarwh.github.io/Saude/**

Para o link funcionar (uma única vez): no GitHub, abra *Settings › Pages › Build and deployment* e em **Source** escolha **GitHub Actions**. O workflow *Publicar app web* publica o app automaticamente a cada atualização (veja a aba *Actions*). O app é um **PWA instalável**: no Android, abra o link no Chrome e toque em *Instalar app* (ou menu ⋮ › *Adicionar à tela inicial*); no computador, use o ícone de instalar na barra de endereço. Depois de aberto uma vez, funciona sem internet.

Na versão web os dados ficam no próprio navegador do aparelho (modo local). Lembretes agendados funcionam apenas no aplicativo Android.

## Começar em 1 minuto (modo local, sem configuração)

```bash
npm install
npx expo start --web        # ou: npx expo start  (Android via development build)
```

Sem credenciais, o app roda em **modo local**: dados apenas no aparelho, busca na TACO, interpretação de frases pelo leitor local e respostas rápidas do assistente. Sem chave de API, dá para usar o **Claude, ChatGPT ou Gemini por copiar e colar**: o app prepara a pergunta, abre o site/app e interpreta a resposta colada (sempre com conferência). Você também pode usar **o seu próprio agente de IA** para montar refeições e transcrever rótulos: copie as instruções em *Alimentação › Colar do agente* ([formato](docs/FORMATO_AGENTE.md)), cole as respostas no app e elas ficam em **Refeições salvas**. Para nuvem, login e IA integrada, siga [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md).

## O que tem

- **Início:** proteína e água em destaque, calorias e macros (com "parcial" quando a fonte não informa um nutriente), atividades, próximo lembrete, evolução de peso e composição, adesão de 7 dias, registro rápido sempre à mão.
- **Alimentação:** diário por refeição; 4 formas de adicionar — pesquisa enquanto digita (TACO, sinônimos, tags/grupos como "fruta" ou "sanduíche", palavras incompletas e pequenos erros de digitação, favoritos, recentes), frase em linguagem natural, foto do rótulo, código de barras (Open Food Facts); receitas, marmitas e lista de compras; suplementos (creatina, vitaminas e minerais registrados à parte, sem mexer nos macros); plano alimentar importado ou proposta orientativa, com alternativas que não são somadas.
- **Evolução:** peso com média móvel, avaliações corporais (importadas por IA com conferência ou digitadas), comparação com a anterior e a inicial, tendências 30/60/90 dias, relatórios PDF/CSV.
- **Atividades:** registro, gasto estimado por MET com faixa de incerteza (sem virar crédito alimentar), consistência semanal.
- **Assistente IA:** chat com seus registros e a base TACO; não diagnostica e respeita metas e planos prescritos.
- **Base de alimentos:** importação em massa por planilha (CSV) ou arquivo; exporte seus cadastros para a base do sistema. Planilhas enviadas para `dados/alimentos/` entram na base na próxima publicação e o app avisa "Atualizar base de dados" ([como](docs/BASE_DE_ALIMENTOS.md)).
- **Perfil:** metas (sugeridas / suas / prescritas), notificações por tipo, privacidade (LGPD: consentimentos, exportar, excluir arquivos e conta), fontes de dados.

## Qualidade

```bash
npm run check        # tipos + lint + 187 testes unitários (inclui os 15 cenários obrigatórios)
npm run test:db      # migrações e RLS em PostgreSQL real
npm run test:e2e     # fluxo completo na versão web (Playwright/Chromium)
```

## Documentação

- [Arquitetura, decisões e plano por fases](docs/ARQUITETURA.md)
- [Status: implementado, dependente de credenciais, não implementado](docs/STATUS.md)
- [Implantação: Supabase, IA, Android, web](docs/IMPLANTACAO.md)
- [Fontes nutricionais e licenças](docs/FONTES_DE_DADOS.md)
- [Base de alimentos do sistema (exportar/incluir)](docs/BASE_DE_ALIMENTOS.md)
- [Política de privacidade (modelo)](docs/PRIVACIDADE.md)

## Estrutura

```
src/app/        telas (Expo Router)          src/domain/    cálculos puros e testados
src/ui/         componentes, tema, gráficos  src/data/      persistência local/nuvem + TACO
src/services/   IA, OFF, arquivos, lembretes, exportação
supabase/       migrações, RLS, seed TACO, Edge Functions (Deno), testes SQL
scripts/        importador da TACO, teste de banco
tests/e2e/      fluxo ponta a ponta (web)
```

Dados nutricionais: TACO 4ª ed. (NEPA/UNICAMP, 2011) — reprodução permitida com citação da fonte; Open Food Facts (ODbL).
