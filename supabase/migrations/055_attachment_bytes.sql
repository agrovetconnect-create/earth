begin;

alter table public.observation_attachments
  add column if not exists content_base64 text,
  add column if not exists storage_path text;

create index if not exists idx_observation_attachments_observation_id
  on public.observation_attachments (observation_id);

commit;
