# Arquitetura e plano de implantação

## Visão geral

```
┌──────────────────────────── App (Expo / React Native, TypeScript) ────────────────────────────┐
│  src/app/        Telas (Expo Router): 5 abas + telas de registro, perfil e configurações       │
│  src/ui/         Componentes reutilizáveis, tema claro/escuro, gráficos SVG                     │
│  src/state/      Provedor (modo local × nuvem, sessão), hooks reativos de dados                │
│  src/services/   IA (Edge Functions), Open Food Facts, arquivos, notificações, exportação      │
│  src/domain/     REGRAS E CÁLCULOS PUROS (sem dependências de UI) — 100% testados              │
│  src/data/       Contrato DataStore + LocalStore (AsyncStorage) + CloudStore (Supabase)        │
│                  Base de referência TACO embarcada (funciona offline)                           │
└──────────────┬──────────────────────────────────────────────────────────────┬───────────────────┘
               │ HTTPS + JWT (RLS)                                            │ HTTPS (sem chave)
┌──────────────▼────────────── Supabase ─────────────────────────┐   ┌────────▼────────┐
│ Auth (e-mail/senha)                                              │   │ Open Food Facts │
│ PostgreSQL: tabelas por usuário + RLS, auditoria, TACO, busca    │   └─────────────────┘
│ Storage privado "health-files" (pasta por usuário)               │
│ Edge Functions (Deno): ai-parse-meal, ai-extract-label,          │──► Anthropic API (Claude)
│   ai-extract-bioimpedance, ai-import-diet, ai-chat,              │──► USDA FoodData Central
│   food-search-usda, delete-account                               │
└──────────────────────────────────────────────────────────────────┘
```

### Princípios

1. **Números vêm de fontes, não do modelo.** A IA identifica alimentos e quantidades, transcreve rótulos, exames e dietas. Valores nutricionais de alimentos genéricos sempre vêm da base (TACO, rótulos, OFF, USDA). Cada item guarda fonte e status (verificado / informado / estimado).
2. **Nada extraído por IA é salvo sem conferência.** Rótulo, exame e dieta viram rascunhos (`src/state/drafts.ts`, `src/services/imports.ts`); só são gravados após o usuário confirmar.
3. **Ausente ≠ zero.** `null` significa "não informado" em todo o domínio; somas contam itens sem dado e a interface mostra "parcial" / "sem registros".
4. **Prioridade de metas:** profissional > usuário > sistema. Recálculos só substituem metas de origem "sistema"; a IA não pode alterar metas (`setTarget(..., { actor: 'ai' })` lança erro) e planos prescritos ficam bloqueados (também no banco, por gatilho).
5. **Lógica testável separada da interface.** Toda regra de negócio está em `src/domain` (funções puras).
6. **Funciona sem nuvem.** Sem credenciais do Supabase, o app roda em *modo local* (dados no aparelho, sem IA), com o mesmo código de telas.

## Decisões técnicas (e por quê)

| Decisão | Motivo |
|---|---|
| Expo SDK 58 + Expo Router + TypeScript | Android-first com uma base de código que também gera PWA; builds na nuvem (EAS) sem Android Studio. |
| Supabase (Postgres + Auth + Storage + Edge Functions) | Um único serviço gerenciado, plano gratuito para uso pessoal, RLS nativa para isolamento por usuário, funções serverless para guardar chaves. |
| Interface `DataStore` com dois adaptadores | Permite uso imediato sem backend e testes de persistência sem rede; a troca é transparente para as telas. |
| Colunas em `snake_case` também no TypeScript | Evita camada de mapeamento app↔banco (menos código, menos bugs). |
| Metas versionadas (`goal_sets`) em vez de sobrescritas | Rastreabilidade: histórico de cada alteração e da sua origem. |
| Snapshot de nutrientes em cada item do diário | O histórico não muda se a base de alimentos for corrigida depois. |
| TACO embarcada no app (JSON, 270 KB) e semeada no banco | Busca instantânea e offline; o chat consulta a mesma base no servidor. |
| Parser local de linguagem natural + IA opcional | Registro por frase funciona offline; a IA melhora a identificação quando disponível. |
| Claude via SDK oficial, saídas estruturadas (Zod) e `fallbacks: "default"` | Respostas validadas por esquema; recusas por política são reencaminhadas no servidor. Modelo configurável (`AI_MODEL`). |
| Contexto do chat montado no app | Reaproveita os mesmos cálculos do domínio; o servidor só acrescenta a busca na base (RLS). |
| Gráficos SVG próprios | Sem dependências nativas pesadas; funcionam no Android e na web; paleta validada para daltonismo. |
| Notificações locais semanais por tipo, IDs `me:<tipo>:<dia>:<hora>` | Cancelamento seletivo por tipo, sem servidor de push. |

## Modelo de dados

Tabelas (todas com `user_id`, RLS `user_id = auth.uid()`, `created_at/updated_at`):

`profiles` · `goal_sets` (versões) · `foods` (alimentos do usuário, rótulos, suplementos, receitas) · `food_favorites` · `diary_entries` (com snapshot) · `recipes` · `water_logs` · `containers` · `activities` · `weight_entries` · `body_assessments` (métricas medidas, equipamento, condições, arquivo original, extração bruta) · `notification_settings` (uma linha por tipo) · `diet_plans` (refeições → opções → itens; `locked`) · `chat_messages` · `audit_log` (somente leitura pelo dono).

Compartilhadas: `reference_foods` (TACO; leitura para autenticados, escrita só pelo service role). Função `search_foods(q)` combina referência + alimentos do próprio usuário.

Storage: bucket privado `health-files`, caminhos `<user_id>/<exames|rotulos|dietas>/<uuid>.<ext>`, políticas por pasta.

## Plano de implantação por fases

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 — Essencial | Autenticação, perfil, metas, painel, hidratação, cadastro de alimentos, diário, suplementos, exercícios, composição corporal manual, gráficos | Implementada (ver `STATUS.md`) |
| 2 — IA | Bioimpedância por IA, OCR de rótulos, linguagem natural, análise de dietas, chat contextual, conferência obrigatória | Implementada; depende de `ANTHROPIC_API_KEY` no servidor |
| 3 — Automação | Lembretes por tipo, código de barras (OFF), USDA, relatórios PDF/CSV, planejamento alimentar | Implementada (USDA depende de chave) |
| 4 — Evolução | Health Connect / dispositivos, tendências avançadas, recomendações individualizadas | Não iniciada |

## Testes

| Camada | Ferramenta | O que cobre |
|---|---|---|
| Domínio e serviços | Jest (`npm test`) | 230 testes, incluindo os 15 cenários obrigatórios (mapa em `STATUS.md`) |
| Banco | `npm run test:db` | Migrações em PostgreSQL 16 real + 20 verificações de RLS, auditoria, bloqueio de dieta e exclusão em cascata |
| Edge Functions | `deno check` | Tipos das 7 funções e conversão dos esquemas Zod para JSON Schema |
| Ponta a ponta | `npm run test:e2e` | Fluxo completo na versão web (cadastro → água → refeição por frase → diário → recarregar → assistente → peso → avaliações → todas as telas) |
