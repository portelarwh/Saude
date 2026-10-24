# Alimentos para a base do sistema

Coloque aqui planilhas **CSV** (Excel: *Salvar como › CSV UTF-8 (separado por vírgulas/ponto e vírgula)*; Google Planilhas: *Arquivo › Fazer download › CSV*) ou arquivos **alimentos-base.json** exportados pelo app (*Perfil › Base de alimentos*).

A cada envio para o GitHub, o workflow de publicação junta tudo em `src/data/reference/alimentos-base.json` e publica o app; quem abrir o app vê o aviso de atualização da base. Localmente: `npm run base:atualizar`.

- Modelo de planilha: [`_modelo.csv`](_modelo.csv) (arquivos começando com `_` são ignorados).
- Uma linha por alimento. Obrigatório: `nome` e pelo menos um valor nutricional.
- `unidade`: `g` ou `ml` (padrão `g`). `valores_por`: `100` (padrão) ou `porcao` — neste caso preencha `porcao` (em g/ml).
- Célula vazia, `-` ou `NA` = **não informado** (nunca vira zero). `Tr` = traços.
- Números com vírgula ou ponto decimal (`6,3` ou `6.3`).
- `fonte`: `rotulo`, `taco`, `tbca`, `usda`, `off`, `manual`, `estimativa`. Estimativas ficam marcadas como estimadas no app.
- `apelidos`: nomes alternativos separados por `|` (ex.: `aipim|macaxeira`).
- `tags`: grupos para a busca, separados por `|` (ex.: `sanduíche|lanche`). Buscar por uma tag mostra todos os alimentos do grupo. Grupos como fruta, doce, carne e bebida já são deduzidos pela categoria e pelo nome.
- Mesmo alimento (mesmo código de barras, ou mesmo nome + marca + sabor + versão) em mais de um arquivo: vale o do arquivo que vem depois em ordem alfabética.

Colunas aceitas: veja o cabeçalho de `_modelo.csv`.
