# Base de alimentos do sistema

Além da TACO, o app traz embutida a base `src/data/reference/alimentos-base.json`, que vem pronta em **novas instalações** (modo local e nuvem). Ela é montada a partir dos arquivos em [`dados/alimentos/`](../dados/alimentos/README.md).

## Aumentar a base

**Pelo repositório (em massa):** envie planilhas CSV ou arquivos `alimentos-base.json` para `dados/alimentos/` (no GitHub: abra a pasta › *Add file › Upload files*). O workflow *Publicar app web* junta tudo em `alimentos-base.json`, grava essa atualização no repositório e publica o app. Localmente: `npm run base:atualizar`.

**Pelo app:** *Perfil › Base de alimentos*
- *Importação em massa:* escolha (ou cole) uma planilha CSV ou um `alimentos-base.json`. O app mostra o que é novo, o que já existe e as linhas com erro antes de salvar. Os itens vão para os seus alimentos.
- *Exportar alimentos-base.json:* gera o arquivo com a base atual + os seus cadastros, pronto para ir para `dados/alimentos/`.

Modelo de planilha: *Baixar modelo de planilha* no app, ou [`dados/alimentos/_modelo.csv`](../dados/alimentos/_modelo.csv). Regras das colunas em [`dados/alimentos/README.md`](../dados/alimentos/README.md).

## Aviso de atualização

Na versão web/PWA, ao abrir (ou voltar para) o app ele consulta `versao.json` do site. Se houver build novo, aparece **"Atualizar base de dados"** (com quantos alimentos novos) ou **"Atualização disponível"**; *Atualizar* recarrega a versão nova. Depois de atualizado, o app avisa uma vez "Base de dados atualizada: N alimentos novos". O app Android instalado por APK recebe a base nova ao instalar o APK novo.

## Regras

- Valores copiados como estão, com **fonte** e **status** (verificado / informado / estimado). Nada é recalculado nem completado; nutriente ausente continua `null`. Valores "por porção" são convertidos para 100 g/ml.
- Estimativas (`fonte: estimativa`) continuam marcadas como estimativa.
- Id estável `base:<nome-marca-sabor>` (ou `base:<código de barras>`), sem dono (`user_id: null`).
- Mesmo alimento = mesmo código de barras, ou mesmo nome + marca + sabor + versão; o arquivo mais recente prevalece. Quem já tem o cadastro próprio não vê a cópia duplicada.
- Os testes `foodBaseSync` e `foodBundle` validam os arquivos de `dados/alimentos/` e a base.

Formato JSON: `{"formato": "meu-equilibrio/alimentos-v1", "atualizado_em": "...", "alimentos": [Food, ...]}` (campos de `Food` em `src/domain/types.ts`).
