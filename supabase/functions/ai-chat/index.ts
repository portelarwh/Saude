/**
 * Meu Assistente IA — chat com acesso (autorizado) aos dados do usuário.
 *
 * - O app envia um resumo calculado dos dados do próprio usuário (metas,
 *   consumo do dia, histórico recente, avaliações corporais, plano ativo).
 * - Números de alimentos vêm da ferramenta search_foods (base TACO e alimentos
 *   do usuário, via RLS) — o modelo é instruído a não inventar valores.
 * - O histórico é salvo em chat_messages (RLS por usuário).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { claude, FALLBACK_BETA, mapApiError, MODEL } from '../_shared/claude.ts';
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { ChatRequestSchema } from '../_shared/schemas.ts';
import { userClient } from '../_shared/supabase.ts';

const SYSTEM = `Você é o "Meu Assistente IA" do aplicativo Meu Equilíbrio, um assistente de nutrição e composição corporal para adultos no Brasil. Responda em português brasileiro, de forma acolhedora, prática e sem julgamentos.

Dados:
- Você recebe, junto de cada pergunta, um bloco <dados_do_usuario> com informações registradas pelo próprio usuário. Use-os para responder; quando um dado não estiver lá, diga que não há registro (falta de registro não significa consumo zero).
- Para valores nutricionais de alimentos, use a ferramenta search_foods e cite a fonte (ex.: "TACO"). Se a base não tiver o alimento, diga isso. Nunca apresente um valor nutricional que não veio da base ou dos registros como se fosse dado oficial; se precisar dar uma ordem de grandeza, rotule claramente como estimativa aproximada.
- Ao citar números, diga de onde vêm: "registrado por você", "calculado pelo app", "estimativa" ou "prescrição profissional".

Limites:
- Você não diagnostica doenças, não interpreta exames como diagnóstico e não substitui médico ou nutricionista. Uma única bioimpedância não permite concluir perda muscular, desidratação ou doença; mencione fatores como hidratação, horário e equipamento.
- Metas e planos marcados como prescritos por profissional têm prioridade: não proponha alterá-los; sugira conversar com o profissional.
- Não recomende dietas extremas, jejum prolongado, restrição hídrica ou proteína elevada quando houver condição de saúde que exija acompanhamento (ex.: doença renal).
- Diferencie recomendações gerais, estimativas nutricionais e prescrições profissionais.
- Sugestões de cardápio: priorize alimentos brasileiros acessíveis e práticos, respeite restrições, alergias e preferências registradas e explique o porquê das sugestões.`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: 'search_foods',
    description:
      'Busca alimentos na base nutricional do app (TACO 4ª ed. e alimentos/rótulos cadastrados pelo usuário). Retorna valores por 100 g ou 100 ml, a fonte e o status de verificação. null significa não informado na fonte.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nome do alimento em português, ex.: "peito de frango grelhado"' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

const MAX_TOOL_ROUNDS = 6;

Deno.serve(
  handler('ai-chat', async (req) => {
    const { client: db, userId } = await userClient(req);
    const body = await readJson(req, (v) => ChatRequestSchema.parse(v));
    const contextJson = JSON.stringify(body.context);
    if (contextJson.length > 60_000) throw new HttpError(413, 'Contexto muito grande', 'context_too_large');

    const { data: profile } = await db.from('profiles').select('consent_ai_at').eq('id', userId).maybeSingle();
    if (!profile?.consent_ai_at) throw new HttpError(403, 'Autorize o uso de IA com seus dados nas configurações de privacidade.', 'ai_consent_required');

    const { data: history, error: historyError } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', body.conversation_id)
      .order('created_at', { ascending: true })
      .limit(30);
    if (historyError) throw new HttpError(500, 'Não foi possível carregar a conversa', 'db');

    const messages: Anthropic.Beta.BetaMessageParam[] = (history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `<dados_do_usuario>\n${contextJson}\n</dados_do_usuario>` },
        { type: 'text', text: body.message },
      ],
    });

    const sources = new Set<string>();
    let answer = '';
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const response = await claude().beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS,
          output_config: { effort: 'medium' },
          messages,
        });
        if (response.stop_reason === 'refusal') {
          answer = 'Não posso ajudar com esse pedido. Se for uma questão de saúde, procure um profissional.';
          break;
        }
        messages.push({ role: 'assistant', content: response.content });
        if (response.stop_reason !== 'tool_use') {
          answer = response.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          break;
        }
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const query = String((block.input as { query?: unknown }).query ?? '').slice(0, 120);
          const { data, error } = await db.rpc('search_foods', { q: query, max_results: 8 });
          if (error) {
            results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Falha ao consultar a base de alimentos.' });
            continue;
          }
          for (const row of data ?? []) sources.add(String(row.source));
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(data ?? []) });
        }
        messages.push({ role: 'user', content: results });
      }
    } catch (e) {
      mapApiError(e);
    }
    if (!answer) answer = 'Não consegui concluir a resposta agora. Tente reformular a pergunta.';

    const meta = { model: MODEL, food_sources: [...sources] };
    const { error: saveError } = await db.from('chat_messages').insert([
      { user_id: userId, conversation_id: body.conversation_id, role: 'user', content: body.message, meta: null },
      { user_id: userId, conversation_id: body.conversation_id, role: 'assistant', content: answer, meta },
    ]);
    if (saveError) console.warn('[ai-chat] falha ao salvar histórico');
    return json({ answer, meta });
  }),
);
