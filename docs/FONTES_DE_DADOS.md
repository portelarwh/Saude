# Fontes nutricionais: estratégia por fonte

| Fonte | Acesso real | Estratégia no app | Licença / termos |
|---|---|---|---|
| **TACO 4ª ed.** (NEPA/UNICAMP) | Planilha XLS oficial, sem API | Importação offline por `scripts/import_taco.py` → `src/data/reference/taco.json` (app) e `supabase/seed/reference_foods_taco.sql` (banco). | "É permitida a reprodução parcial ou total desta obra, desde que citada a fonte." Citação exibida em *Fontes de dados*. |
| **TBCA** (USP/FoRC) | Site de consulta; sem API pública | Não integrada. Para integrar: obter autorização formal e criar um importador análogo ao da TACO. Até lá, o usuário pode cadastrar manualmente consultando o site. | Reprodução em bases de dados requer autorização. |
| **USDA FoodData Central** | API REST pública com chave gratuita | Edge Function `food-search-usda` (chave no servidor). Busca complementar na tela de pesquisa (modo nuvem); o resultado passa pela tela de conferência. | Domínio público (EUA). |
| **Open Food Facts** | API pública sem chave | Consulta direta do app por código de barras; dados marcados como "informado" e conferidos antes de salvar. | ODbL — atribuição exibida; bases derivadas devem manter a licença. |
| **Rótulos de fabricantes** | Embalagem do produto | Foto + IA (transcrição) ou digitação; prioridade máxima para industrializados e suplementos; um cadastro por sabor/versão. | — |
| **Usuário** | — | Cadastro manual e receitas (soma de ingredientes). | — |

## Regras de qualidade

- **Ausência ≠ zero.** `NA`, `*` ou campo vazio → `null` ("não informado"). `Tr` (traços) → 0 com marcação de traço.
- **Status de cada alimento:** `verified` (conferido em fonte oficial/rótulo), `reported` (vindo da fonte, não conferido individualmente — padrão para TACO/OFF/USDA importados), `estimated` (receitas, porções aproximadas).
- **Prioridade na busca:** rótulo do produto > cadastros do usuário > TACO/TBCA > Open Food Facts > USDA.
- **Medidas caseiras** associadas à TACO (`src/data/reference/tacoExtras.ts`) são estimativas usuais, marcadas com "~" e "estimado"; um teste garante que todos os nomes referenciados existem na tabela.

## Atualizar a TACO

```bash
pip install xlrd==2.*
python3 scripts/import_taco.py caminho/Taco_4a_edicao_2011.xls
npm test   # confere contagem e sinônimos
```
