import fs from 'fs';
import path from 'path';
import { AGENT_INSTRUCTIONS } from '../agentFormat';

const DOC = path.resolve(__dirname, '../../../docs/FORMATO_AGENTE.md');
const HEADER = `# Formato para o seu agente de IA (meu-equilibrio/v1)

Sem chave de API, use qualquer agente (projeto do Claude, GPT personalizado, Gem do Gemini) para montar refeições e transcrever rótulos. Cole as instruções abaixo nas instruções do agente uma única vez (no app: Alimentação › Colar do agente › Copiar instruções). Depois cole as respostas do agente na tela **Colar do agente de IA**:

- **Refeição:** o app associa cada item à base (TACO ou alimentos/rótulos que você salvou). A estimativa do agente só é usada para itens que o app não encontra, e fica marcada como "estimativa da IA externa". Você confere e salva em **Refeições salvas** para registrar depois com um toque.
- **Rótulo:** abre a tela de conferência do cadastro de alimento; ao salvar, o produto passa a ser encontrado pela busca e pelas refeições do agente.

## Instruções para o agente

`;

export function agentDoc(): string {
  return `${HEADER}${AGENT_INSTRUCTIONS}\n`;
}

describe('docs/FORMATO_AGENTE.md', () => {
  it('está sincronizado com as instruções do app', () => {
    if (process.env.UPDATE_AGENT_DOC) fs.writeFileSync(DOC, agentDoc());
    expect(fs.readFileSync(DOC, 'utf8')).toBe(agentDoc());
  });
});
