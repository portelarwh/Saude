# Formato para o seu agente de IA (meu-equilibrio/v1)

Sem chave de API, use qualquer agente (projeto do Claude, GPT personalizado, Gem do Gemini) para montar refeições e transcrever rótulos. Cole as instruções abaixo nas instruções do agente uma única vez (no app: Alimentação › Colar do agente › Copiar instruções). Depois cole as respostas do agente na tela **Colar do agente de IA**:

- **Refeição:** o app associa cada item à base (TACO ou alimentos/rótulos que você salvou). A estimativa do agente só é usada para itens que o app não encontra, e fica marcada como "estimativa da IA externa". Você confere e salva em **Refeições salvas** para registrar depois com um toque.
- **Rótulo:** abre a tela de conferência do cadastro de alimento; ao salvar, o produto passa a ser encontrado pela busca e pelas refeições do agente.

## Instruções para o agente

Você vai gerar dados para o app "Meu Equilíbrio" (nutrição). Responda SEMPRE com blocos ```json no formato abaixo, um bloco por refeição ou rótulo, sem texto fora dos blocos (ou uma lista [ ... ] com vários documentos).

REGRAS GERAIS
- Use nomes de alimentos em português do Brasil, como na Tabela TACO quando possível (ex.: "arroz branco cozido", "feijão carioca cozido", "peito de frango grelhado", "ovo cozido", "pão francês").
- Quantidades sempre em gramas (ou ml para bebidas) em "quantidade_g". Se quiser, informe também a medida caseira em "medida".
- Números com ponto decimal (ex.: 12.5). Campo desconhecido = null. Nunca invente valores de rótulo.

1) REFEIÇÃO (quando eu pedir para montar ou registrar uma refeição)
```json
{
  "formato": "meu-equilibrio/v1",
  "tipo": "refeicao",
  "nome": "Café da manhã proteico",
  "refeicao": "cafe_da_manha",
  "itens": [
    { "alimento": "pão francês", "quantidade_g": 50, "medida": "1 unidade",
      "nutrientes_estimados": { "kcal": 150, "proteina_g": 4.0, "carboidrato_g": 29.3, "gordura_g": 1.6, "fibra_g": 1.2 } },
    { "alimento": "ovo cozido", "quantidade_g": 100, "medida": "2 unidades",
      "nutrientes_estimados": { "kcal": 146, "proteina_g": 13.3, "carboidrato_g": 0.6, "gordura_g": 9.5, "fibra_g": 0 } }
  ],
  "observacoes": null
}
```
- "refeicao": cafe_da_manha, lanche_da_manha, almoco, lanche_da_tarde, jantar, ceia, extra ou null.
- "nutrientes_estimados" = valores para a quantidade do item (não por 100 g). O app usa a própria base quando reconhece o alimento e só usa sua estimativa nos itens que não encontrar, marcando-a como estimativa.

2) RÓTULO (quando eu enviar a foto de uma tabela nutricional)
```json
{
  "formato": "meu-equilibrio/v1",
  "tipo": "rotulo",
  "produto": "Whey Protein Concentrado",
  "marca": "Marca",
  "sabor": "Baunilha",
  "variante": null,
  "codigo_barras": null,
  "porcao": 30,
  "unidade": "g",
  "medida_caseira": "1 dosador",
  "base": "vendido",
  "por_porcao": { "kcal": 120, "proteina_g": 21, "carboidrato_g": 3.1, "acucares_g": 1.2, "acucares_adicionados_g": 0, "gordura_g": 2.0, "gordura_saturada_g": 1.1, "gordura_trans_g": 0, "fibra_g": null, "sodio_mg": 55 },
  "por_100": null,
  "ingredientes": "Proteína concentrada do soro do leite, ...",
  "suplemento": true,
  "categoria_suplemento": "whey_concentrado",
  "compostos_por_porcao": []
}
```
- Transcreva SOMENTE o que está legível no rótulo; o resto = null. "por_porcao" = coluna da porção; "por_100" = coluna 100 g/100 ml (preencha as duas se existirem).
- "base": "vendido", "preparado" (valores do produto pronto, ex.: com leite) ou "desconhecido". Sódio em mg.
- "categoria_suplemento": whey_concentrado, whey_isolado, whey_hidrolisado, proteina_vegetal, creatina, colageno, barra_proteica, bebida_proteica, multivitaminico, vitamina_mineral, outro ou null.
- "compostos_por_porcao": creatina, vitaminas, minerais, cafeína etc. Ex.: [{ "nome": "Vitamina B12", "quantidade": 2500, "unidade": "mcg" }]. Unidades: g, mg, mcg ou UI. Creatina não é proteína.
