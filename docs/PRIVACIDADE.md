# Política de privacidade — Meu Equilíbrio (modelo)

> Texto-base para publicação. Revise com assessoria jurídica antes de disponibilizar o app a terceiros e preencha os dados do controlador.

**Controlador:** [nome/razão social, CPF/CNPJ, e-mail do encarregado (DPO)].

## 1. Dados tratados
- Cadastro: nome, e-mail, data de nascimento, sexo biológico (apenas para equações), altura, peso e medidas.
- **Dados sensíveis de saúde (LGPD, art. 5º, II):** composição corporal, exames enviados, condições de saúde informadas, alimentação, hidratação, suplementos, atividade física, orientações profissionais.
- Arquivos enviados: fotos/PDFs de exames, rótulos e planos alimentares.
- Conversas com o assistente de IA.

## 2. Finalidades e base legal
- Calcular metas orientativas e acompanhar a evolução do próprio titular — **consentimento específico e destacado** (art. 11, I), coletado no cadastro inicial.
- Recursos de IA (leitura de arquivos, interpretação de frases, chat) — consentimento separado e revogável a qualquer momento em *Perfil › Privacidade*.

## 3. Compartilhamento
- **Supabase** (infraestrutura de banco, autenticação e armazenamento) como operador.
- **Anthropic** (provedor de IA) como operador, somente quando o titular usa um recurso de IA; é enviado apenas o conteúdo necessário.
- **Open Food Facts** recebe apenas o código de barras consultado; **USDA** apenas o termo de busca.
- Não há compartilhamento com outros usuários, anunciantes ou corretores de dados.
- Transferência internacional: os operadores podem processar dados fora do Brasil (art. 33); escolha a região do projeto Supabase conforme sua necessidade.

## 4. Segurança
- Conexões HTTPS; senhas gerenciadas pelo Supabase Auth.
- Isolamento por usuário no banco (Row Level Security) e armazenamento privado por pasta, sem links públicos (links temporários de 5 minutos para visualização).
- Chaves de serviços (IA, USDA, service role) apenas no servidor.
- Logs técnicos sem conteúdo de exames, refeições ou mensagens.
- Histórico de alterações de dados críticos para rastreabilidade (sem copiar observações de saúde).

## 5. Direitos do titular (art. 18)
Confirmação e acesso, correção (edição no app), portabilidade (*exportar JSON/CSV*), eliminação de arquivos específicos, eliminação da conta e de todos os dados, informação sobre compartilhamento e revogação do consentimento — todos disponíveis em *Perfil › Privacidade* ou pelo e-mail do encarregado.

## 6. Retenção
Os dados são mantidos enquanto a conta existir. A exclusão da conta apaga registros e arquivos de forma definitiva (cascata no banco e remoção do storage).

## 7. Limites do serviço
O app oferece orientações gerais e estimativas. Não realiza diagnósticos, não substitui médico ou nutricionista e não altera planos prescritos por profissionais.
