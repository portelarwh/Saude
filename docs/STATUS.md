# Status das funcionalidades

Legenda:
- ✅ **Implementado e verificado** — funciona e foi exercitado por testes automatizados (unitários, banco ou E2E web).
- 🟡 **Implementado, depende de configuração/credenciais** — código completo e checado (tipos/esquemas), mas não executado contra o serviço real neste ambiente (sem chaves).
- 📱 **Implementado, não executado em aparelho** — usa APIs nativas do Expo (câmera, notificações, compartilhamento, impressão); a configuração Android foi validada com `expo prebuild`, mas não houve teste em dispositivo/emulador aqui.
- ⬜ **Não implementado** (e o motivo).

Nada está **simulado**: não há telas de demonstração com dados falsos. Onde um serviço não está configurado, o app informa e oferece o caminho manual.

## Por seção do pedido

| # | Funcionalidade | Status | Observações |
|---|---|---|---|
| 2 | Assistente de cadastro inicial (7 etapas, só o essencial obrigatório) | ✅ | Consentimento LGPD, viabilidade do prazo, metas explicadas |
| 2 | Cadastro por bioimpedância no onboarding | 🟡 | Usa a importação de exame; no modo local, entrada manual |
| 2 | Editar qualquer dado depois | ✅ | Perfil, metas, alimentos, receitas, avaliações (corrigir valores), diário |
| 3 | TMB (Mifflin–St Jeor; Katch–McArdle com MLG), GET, calorias, macros, fibras, água | ✅ | Explicação de cada meta; peso de referência (IMC 25) em obesidade |
| 3 | Salvaguardas (doença renal/hepática, IC, gestação, TA) | ✅ | Sem meta automática nesses casos |
| 3 | Metas sugeridas / do usuário / prescritas, com prioridade | ✅ | Versões em `goal_sets`; IA bloqueada |
| 3 | Meta, consumido, % e restante | ✅ | "Sem registros" ≠ 0 |
| 4 | Importar exame (PDF/JPG/PNG) com IA e conferência | 🟡 | Extrai só indicadores presentes; nada salvo sem confirmação |
| 4 | Entrada manual de avaliação | ✅ | |
| 4 | Comparação anterior/inicial, numérica e interpretativa | ✅ | Unidades verificadas; limiares de variação de medição |
| 4 | Tendências 30/60/90 dias, gráficos por data | ✅ | "Consistente" exige ≥ 3 avaliações |
| 4 | Arquivo original guardado e excluível | 🟡 | Storage privado; exclusão em Privacidade |
| 5 | Diário por refeição + refeições extras | ✅ | "Extra" disponível; nomes personalizados no modelo de dados (sem tela própria ainda) |
| 5 | Método 1 — pesquisa (nome, marca, categoria, ingrediente, sinônimos) | ✅ | TACO + alimentos do usuário; favoritos e recentes |
| 5 | Método 2 — linguagem natural | ✅ local / 🟡 IA | Parser local offline; IA quando configurada. Pergunta sobre óleo/manteiga |
| 5 | Método 3 — foto do rótulo | 🟡 | IA transcreve, normaliza por 100 g/ml e porção; sem IA: digitação |
| 5 | Método 4 — código de barras (Open Food Facts) | ✅ lógica / 📱 câmera | Digitação do código funciona em qualquer plataforma |
| 6 | TACO integrada | ✅ | 597 alimentos da planilha oficial; NA/* = não informado |
| 6 | Open Food Facts | ✅ | Consulta por código |
| 6 | USDA FoodData Central | 🟡 | Requer `USDA_API_KEY` no servidor |
| 6 | TBCA | ⬜ | Sem API pública; reprodução exige autorização (ver `FONTES_DE_DADOS.md`) |
| 6 | Campos do alimento (fonte, verificação, estado de preparo, medidas caseiras…) | ✅ | Medidas caseiras da TACO marcadas como estimadas |
| 6 | Evitar duplicidades | ✅ | Por código de barras e nome+marca+sabor+variante |
| 7 | Receitas (total, por 100 g, por porção, rendimento) | ✅ | |
| 7 | Favoritas, marmitas (escala), substituição de ingredientes, lista de compras | ✅ | |
| 7 | Copiar refeição anterior / replicar em outro dia | ✅ | "Repetir de ontem" e "Copiar para amanhã" |
| 8 | Suplementos: categorias, doses, horários, misturas | ✅ | |
| 8 | Proteína do suplemento somada ao dia; creatina fora da proteína | ✅ | Validação impede cadastro de creatina como proteína |
| 8 | Vitaminas e minerais (ex.: B12 2500 mcg) | ✅ | Compostos com unidade (g, mg, mcg, UI) somados à parte; opção "sem calorias nem macros" — não alteram metas nem totais; "Vit B12 2500mcg" na frase vira 1 dose |
| 8 | Pré-cadastro de produtos de marcas (Growth, DUX…) | ⬜ | **Intencional**: sem rótulos verificados, seria apresentar dados não conferidos. Marcas listadas; cadastro por rótulo |
| 9 | Painel de água, botões rápidos, recipientes, bebidas que contam | ✅ | |
| 9 | Histórico por horário, 7 e 30 dias | ✅ | |
| 9 | Lembretes proporcionais ao consumo | ✅ no app / 📱 notificação | Mensagem proporcional no painel; notificações agendadas têm texto fixo |
| 10 | Central de notificações por tipo (horários, dias, intervalo, silêncio) | ✅ lógica / 📱 entrega | Desativar um tipo não afeta os outros (testado). Web: não suportado |
| 10 | Notificações "inteligentes" com valores do dia | ✅ no app | Mostradas no painel; push com conteúdo dinâmico ⬜ (exigiria tarefa em segundo plano) |
| 11 | Registro de atividades, MET líquido com faixa de incerteza | ✅ | Não vira crédito alimentar (padrão 0%) |
| 11 | Evitar contagem dupla | ✅ | Deduplicação por sobreposição de horário |
| 11 | Consistência semanal | ✅ | |
| 11 | Health Connect / dispositivos | ⬜ | Fase 4 |
| 12 | Chat com dados do usuário | 🟡 | Contexto calculado no app; busca na base no servidor; histórico salvo |
| 12 | Respostas sem IA para perguntas frequentes | ✅ | Proteína/água restantes, manhãs, evolução de gordura, comparação de proteína |
| 5/7 | Refeições montadas por agente externo (colar JSON) e **Refeições salvas** | ✅ | Formato em `docs/FORMATO_AGENTE.md`. Itens associados à base; estimativa do agente só onde não há correspondência, marcada. Salvar refeição do diário; registrar de novo com um toque |
| 5 | Rótulos transcritos por agente externo (colar JSON) | ✅ | Mesma conferência do cadastro de alimento |
| 12 | IA externa por copiar e colar (Claude, ChatGPT, Gemini), sem chave de API | ✅ | Chat, frase, rótulo, exame e dieta. O app copia a pergunta (com instruções e formato JSON), abre o site/app e interpreta a resposta colada com os mesmos esquemas da IA integrada; sempre passa pela conferência. Nutrientes continuam vindo da base |
| 13 | Importar dieta (foto/PDF/texto) e separar alternativas | 🟡 IA / ✅ texto local | Alternativas não são somadas (testado ponta a ponta) |
| 13 | Calorias e macros por refeição, total, comparação com metas, pontos de atenção | ✅ | |
| 13 | Plano prescrito bloqueado; adesão diária | ✅ | Bloqueio também no banco (gatilho) |
| 14 | Proposta alimentar orientativa | ✅ | Por regras, alimentos brasileiros, restrições/alergias, explicações; não usa IA |
| 14 | Distribuição de proteína, substituições, lista de compras | ✅ | |
| 15 | Painel com proteína e água em destaque, macros, atividades, próximo lembrete, evolução | ✅ | |
| 15 | Ação rápida de registro sempre acessível | ✅ | Botão flutuante nas abas |
| 16 | Relatórios semanal/mensal, confiabilidade, lacunas, sugestões | ✅ | Médias só de dias com registro |
| 16 | Exportar PDF e CSV (Excel) | ✅ web / 📱 Android | |
| 17 | Supabase (Auth, Postgres, Storage privado, RLS) | 🟡 | RLS testada em PostgreSQL real; não executado contra um projeto Supabase |
| 17 | Cache para conectividade limitada | ✅ | TACO embarcada; leituras da nuvem em cache |
| 17 | Histórico e rastreabilidade | ✅ | `audit_log` + metas versionadas + snapshot no diário |
| 17 | Sem chaves de API no app | ✅ | Apenas URL e chave pública do Supabase |
| 18 | LGPD: consentimento, transparência de IA, exportação, exclusão de arquivos e conta | ✅ local / 🟡 nuvem | |
| 19 | Tema claro/escuro, 5 abas, perfil com configurações | ✅ | |

## Cenários obrigatórios (seção 21)

| # | Cenário | Onde é verificado |
|---|---|---|
| 1 | 250 ml reduz o restante | `tracking.test.ts` + E2E ("Faltam 2,55 L") |
| 2 | Macros proporcionais à quantidade | `nutrition.test.ts` |
| 3 | "Pão com dois ovos" → sugestão para confirmar | `foods.test.ts` + E2E |
| 4 | Rótulo → alimento com porção e unidades corretas | `nutrition.test.ts` (normalização), `services.test.ts` (extração → alimento) |
| 5 | Dose de whey soma a proteína real do produto | `nutrition.test.ts` |
| 6 | Creatina não soma proteína | `nutrition.test.ts`, `services.test.ts` |
| 7 | Bioimpedância estruturada e salva só após conferência | `services.test.ts` |
| 8 | Comparação por data e indicador, com unidades | `tracking.test.ts` + E2E |
| 9 | Dieta com alternativas não soma todas | `tracking.test.ts`, `plans.test.ts`, `services.test.ts` |
| 10 | Desativar um tipo de notificação não afeta os demais | `tracking.test.ts`, `services.test.ts` (sincronização) |
| 11 | Fechar e reabrir não apaga registros | `services.test.ts` + E2E (recarregar página) |
| 12 | Usuário não acessa dados de outro | `supabase/tests/rls_test.sql` (PostgreSQL real) + `services.test.ts` (modo local) |
| 13 | Integração indisponível → aviso e cadastro manual | `services.test.ts` (Open Food Facts); telas de IA mostram erro + caminho manual |
| 14 | IA nunca apresenta valor fabricado como oficial | `services.test.ts` (campos nutricionais da IA descartados; nutrientes da base) |
| 15 | Painel mostra ausência de registros sem assumir zero | `tracking.test.ts`, `aiContext.test.ts` + E2E |

## Limitações conhecidas

- Não houve execução em Android real/emulador neste ambiente; recomenda-se um build de desenvolvimento (`eas build --profile development`) para validar câmera, notificações e compartilhamento.
- As funções de IA não foram chamadas contra a API real (sem chave aqui); esquemas e tipos foram validados.
- Medidas caseiras usadas para alimentos da TACO são estimativas (a TACO não as publica) e aparecem marcadas como tal.
- Na TACO, alguns alimentos têm valores "em análise" (ex.: leite integral sem energia/macros) — o app mostra "não informado" e o total fica "parcial".
