/**
 * Exclusão definitiva da conta (LGPD, art. 18, VI): remove os arquivos do
 * usuário no storage privado e o usuário de autenticação. As tabelas têm
 * "on delete cascade", então todos os registros associados são apagados.
 */
import { z } from 'zod';
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { serviceClient, userClient } from '../_shared/supabase.ts';

const Body = z.object({ confirm: z.literal('EXCLUIR') });

Deno.serve(
  handler('delete-account', async (req) => {
    const { userId } = await userClient(req);
    await readJson(req, (v) => Body.parse(v));
    const admin = serviceClient();

    // remove arquivos em todas as subpastas do usuário
    const folders = ['exames', 'rotulos', 'dietas', 'outros'];
    for (const folder of folders) {
      const prefix = `${userId}/${folder}`;
      const { data: files } = await admin.storage.from('health-files').list(prefix, { limit: 1000 });
      if (files?.length) {
        await admin.storage.from('health-files').remove(files.map((f) => `${prefix}/${f.name}`));
      }
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new HttpError(500, 'Não foi possível excluir a conta. Tente novamente.', 'delete_failed');
    return json({ deleted: true });
  }),
);
