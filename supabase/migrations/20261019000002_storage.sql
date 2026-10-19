-- Armazenamento privado de exames, rótulos e planos alimentares.
-- Estrutura de caminhos: <user_id>/<categoria>/<arquivo>
-- Somente o dono acessa; não há URLs públicas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('health-files', 'health-files', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy health_files_select on storage.objects for select to authenticated
  using (bucket_id = 'health-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy health_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'health-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy health_files_update on storage.objects for update to authenticated
  using (bucket_id = 'health-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy health_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'health-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
