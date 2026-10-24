# Meu Equilíbrio — notas para agentes

- Regras de negócio ficam em `src/domain` (funções puras, sem React). Toda regra nova precisa de teste em `src/domain/__tests__` ou `src/services/__tests__`.
- `null` = "não informado". Nunca converta ausência em zero; somas usam `sumNutrients` (conta itens sem dado).
- Números nutricionais vêm de fontes (TACO, rótulo, OFF, USDA). A IA apenas extrai/identifica; nada extraído é salvo sem tela de conferência. Exceção pedida pelo usuário: refeições coladas do agente externo (`src/domain/agentFormat.ts`) podem usar a estimativa do agente só para itens sem correspondência na base, sempre com `source: 'ai_estimate'`/`verification: 'estimated'` e sinalizadas na interface.
- O formato do agente externo está em `AGENT_INSTRUCTIONS`; ao mudá-lo, rode `UPDATE_AGENT_DOC=1 npx jest agentDoc` para atualizar `docs/FORMATO_AGENTE.md`.
- Metas: prioridade profissional > usuário > sistema (`mergeSystemSuggestions`, `setTarget`). Planos `locked` não podem ser alterados por automações.
- Persistência sempre via `DataStore` (`useStore`, `useCollection`); não acesse AsyncStorage/Supabase direto nas telas.
- Esquema do banco em `supabase/migrations` (snake_case, RLS por `user_id`). Ao mudar o esquema, atualize os tipos em `src/domain/types.ts` e rode `npm run test:db`.
- Edge Functions em `supabase/functions` (Deno); checagem: `deno check --config deno.json */index.ts`.
- Antes de concluir: `npm run check` (tipos, lint, testes) e, para telas, `npm run test:e2e`.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
