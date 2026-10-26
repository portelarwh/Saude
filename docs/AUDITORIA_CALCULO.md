# Auditoria do motor de cálculo (especificação "Revisão e aprimoramento", v1.0)

Data: 26/10/2026 · App 1.2.0 · Código: `src/domain/energy.ts`, `src/domain/goals.ts` (funções puras, sem duplicação entre telas; todas as telas e o recálculo usam `calculateGoals`).

Os números abaixo foram obtidos rodando o motor atual com os dados dos testes A–E da especificação (110 kg, 176 cm, 41 anos, sedentário, emagrecimento, peso-alvo 90 kg).

## 1. Situação atual × especificação

| Componente | Hoje | Especificação | Avaliação |
|---|---|---|---|
| Metabolismo de repouso | Mifflin–St Jeor (+5 / −161) ✅; Katch–McArdle quando há massa magra medida (aprovado no item D) | Mifflin como padrão | **Correto.** Teste A: 2.000 kcal ✅; Teste B: 1.834 kcal ✅. Só o nome na tela ("TMB") deveria ser "metabolismo de repouso estimado". |
| Fatores de atividade | 1,2 / 1,375 / 1,55 / 1,725 / 1,9, centralizados ✅ | Mesmos fatores | **Correto.** Ponto válido: a sugestão por treino leva a "Muito ativo" com 5+ treinos/semana; a especificação alerta contra isso. |
| Objetivo calórico | Emagrecer: déficit de 20% (máx. 750 kcal), com piso = maior entre TMR e 1.200/1.500 kcal | Déficit 10/15/20% configurável, padrão 15%; 1.200/1.500 como triagem; TMR como alerta, não piso | **Divergente.** Para sedentário, qualquer déficit > 16,7% cai abaixo da TMR, então hoje o piso decide (Teste A: 2.000 kcal; especificação: 2.040). Diferença pequena, mas o usuário não escolhe o ritmo. |
| Proteína | Fator por objetivo e treino; base = peso de referência (peso atual, ou IMC 25 se IMC ≥ 30); opções 1,2–2,2 g/kg; base opcional em massa magra | Peso-alvo plausível como opção; não aplicar fatores de peso total sobre massa magra | **Bom na obesidade** (Teste D: nunca 2,2 × 110). Dois pontos válidos: falta a opção "peso-alvo"; e aplicar o mesmo g/kg sobre a massa magra não tem respaldo — fatores por massa magra são outros. |
| Gorduras | 28% das calorias, mínimo 0,6 g/kg; low carb: completa as calorias | 30% (20–35%) | **Equivalente.** 28% × 30% muda ~4 g; não vale a troca. |
| Carboidratos | Calorias restantes ✅ | Calorias restantes | **Correto.** Falha: resultado negativo vira 0 sem erro explícito. Arredondamento: gordura é arredondada antes e o carbo fecha a conta — a soma exibida fica a ≤ 4 kcal da meta (dentro da tolerância de 5 kcal da especificação). |
| Fibras | 14 g/1.000 kcal, mínimo 25 g | 14 g/1.000 kcal | **Correto** (o mínimo de 25 g só vale para metas < 1.786 kcal). |
| Água | 35 ml/kg do peso de referência, +500 ml atividade intensa/calor, rotulada como "bebidas" ✅; bloqueia renal/cardíaco ✅ | 30 ml/kg como heurística; mostrar EFSA (2,0/2,5 L de água total, incluindo alimentos) | **Aceitável.** 35 ml/kg é usual na prática clínica brasileira (30–35); a EFSA ainda não aparece na meta. |
| Suplementos | Separados do cálculo ✅; creatina educativa, nunca obrigatória ✅ | Módulo independente | **Correto.** Cafeína: não há módulo (não é necessário agora). |
| Validação | Ausências viram "dados faltantes" ✅; null nunca vira zero ✅ | Rejeitar entradas inválidas; não calcular para menores | **Falhas reais:** peso negativo gera 1.500 kcal e −16 g de proteína; 15 anos recebe meta automática (2.130 kcal). A tela valida, mas o motor não. |
| Transparência | Cada meta mostra fórmula, dados e resultado ✅ | "Como calculamos" com fonte | **Quase lá:** falta citar a fonte de cada meta e a versão das fórmulas. |

## 2. O que adotar

**Melhoram de fato (baixo risco) — aplicados na 1.2.1:**
1. Validação no motor: peso 30–350 kg, altura 100–250 cm, idade 18–100; fora disso, sem meta e com aviso claro.
2. Menores de 18 anos: sem meta automática (como já é com gestação e transtorno alimentar).
3. Carboidrato negativo/impossível: aviso explícito de configuração em vez de 0 silencioso.
4. Sugestão de atividade pelo treino limitada a "Moderadamente ativo" (o trabalho e o dia a dia decidem acima disso).
5. "TMB" → "metabolismo de repouso estimado" na tela.
6. Fonte científica e versão das fórmulas em cada meta.
7. Testes A–E da especificação como testes de regressão.

**Aprovados pelo usuário e aplicados na 1.3.0:**
- A. Ritmo do emagrecimento selecionável (10/15/20%), padrão 15%; TMR passa a ser alerta (1.200/1.500 kcal continuam como bloqueio).
- B. Proteína: nova base "peso-alvo" (quando plausível e o objetivo for emagrecer); base "massa magra" sai da proteína (continua no metabolismo).
- C. Água: manter 35 ml/kg e mostrar a referência da EFSA ao lado, ou passar para 30 ml/kg.

**Não adotar:**
- Trocar 28% → 30% de gordura (efeito desprezível).
- Remover o arredondamento atual (já dentro da tolerância; a soma exibida bate com a meta).
- Reestruturar os objetos de entrada/saída com novos nomes de campos (só retrabalho, sem ganho para o usuário).

## 3. Pendências de validação profissional
- Política de peso de referência em obesidade (IMC 25 × peso-alvo).
- Limites de déficit e o uso da TMR como piso ou alerta.
- Faixa do low carb moderado (100–130 g/dia).
