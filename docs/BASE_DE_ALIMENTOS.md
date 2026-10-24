# Base de alimentos do sistema

Além da TACO, o app traz embutida a base `src/data/reference/alimentos-base.json`: alimentos cadastrados por você (rótulos, receitas, suplementos, itens do agente de IA) que passam a vir prontos em **novas instalações**, no modo local e na nuvem.

## Como incluir os seus cadastros

1. No app: *Perfil › Base de alimentos › Exportar alimentos-base.json*.
   O arquivo junta a base atual com os seus cadastros (o seu cadastro prevalece em caso de repetição; a TACO não entra).
2. Substitua `src/data/reference/alimentos-base.json` no repositório por esse arquivo (no GitHub: *Add file › Upload files* na pasta `src/data/reference`) — ou envie o arquivo para quem mantém o projeto.
3. O teste `foodBundle` confere que o arquivo é válido; o próximo build já publica a nova base.

## Regras

- Os valores são copiados como estão, com **fonte** (rótulo, OFF, manual, estimativa do agente…) e **status** (verificado / informado / estimado). Nada é recalculado nem completado: nutriente ausente continua `null`.
- Itens estimados pelo agente continuam marcados como estimativa.
- Cada alimento recebe um id estável `base:<nome-marca-sabor>` (ou `base:<código de barras>`), sem dono (`user_id: null`).
- Mesmo alimento = mesmo código de barras, ou mesmo nome + marca + sabor + versão. Quem já tem o cadastro próprio não vê a cópia duplicada da base.

## Importar em outro aparelho

*Perfil › Base de alimentos › Escolher arquivo* (ou colar o conteúdo) adiciona aos seus alimentos apenas os itens que você ainda não tem.

Formato: `{"formato": "meu-equilibrio/alimentos-v1", "atualizado_em": "...", "alimentos": [Food, ...]}` — os campos de cada alimento são os de `Food` em `src/domain/types.ts`.
