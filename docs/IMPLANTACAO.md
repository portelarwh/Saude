# Implantação (modo nuvem com Supabase e IA)

Sem estes passos o app funciona em **modo local** (dados só no aparelho, sem IA).

## 1. Projeto Supabase
1. Crie um projeto em <https://supabase.com> (região de sua preferência; ex.: São Paulo).
2. Instale a CLI e vincule: `npx supabase login && npx supabase link --project-ref <ref>`.
3. Aplique o esquema e os dados de referência:
   ```bash
   npx supabase db push                      # migrações (tabelas, RLS, storage, auditoria)
   psql "$SUPABASE_DB_URL" -f supabase/seed/reference_foods_taco.sql   # TACO no banco
   ```
4. Em *Authentication › URL Configuration*, ajuste o *Site URL* e os redirecionamentos (o esquema do app é `meuequilibrio://`).

## 2. Segredos e Edge Functions
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # obrigatório para IA
npx supabase secrets set AI_MODEL=claude-opus-5-5           # opcional (padrão)
npx supabase secrets set USDA_API_KEY=...                   # opcional (busca USDA)
npx supabase functions deploy ai-parse-meal ai-extract-label ai-extract-bioimpedance ai-import-diet ai-chat food-search-usda delete-account
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já estão disponíveis para as funções.

## 3. App
Crie `.env` a partir de `.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<chave anon/publishable>
```
A chave *anon* é pública por definição; a proteção dos dados vem das políticas RLS.

## 4. Android
```bash
npm install
npx expo start              # desenvolvimento (Expo Go não inclui todos os módulos: prefira um development build)
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build --platform android --profile production
```

## 5. Web (PWA)
```bash
npx expo export --platform web     # gera dist/ (hospede em qualquer servidor estático com fallback para index.html)
```
Limitações da web: lembretes agendados não funcionam; câmera para código de barras depende do navegador (é possível digitar o código); exportação de PDF usa "Imprimir › Salvar como PDF".

## Custos (uso pessoal)
- Supabase: plano gratuito costuma bastar para 1 usuário.
- IA: cobrança por uso da API da Anthropic; leitura de um exame ou rótulo é uma chamada; o chat envia um resumo compacto dos dados (até ~60 KB) por pergunta. O modelo e o esforço podem ser ajustados por `AI_MODEL` e no código (`output_config.effort`).
