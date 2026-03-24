-- Storage: explicit service_role policies (Node API uses service role; RLS is usually bypassed — these document intent).
-- Also merged into supabase/FULL_DATABASE_CODE.sql

drop policy if exists sources_private_service_role_all on storage.objects;
create policy sources_private_service_role_all on storage.objects
for all
to service_role
using (bucket_id = 'sources-private')
with check (bucket_id = 'sources-private');

drop policy if exists presentation_assets_service_role_all on storage.objects;
create policy presentation_assets_service_role_all on storage.objects
for all
to service_role
using (bucket_id = 'presentation-assets')
with check (bucket_id = 'presentation-assets');
