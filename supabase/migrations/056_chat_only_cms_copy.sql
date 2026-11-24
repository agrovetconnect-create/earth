begin;

update public.cms_pages
set content = replace(content::text, 'web submission form', 'Submit Field Observation chat')::jsonb,
    version = version + 1,
    updated_by = 'migration_056_chat_only_submission',
    updated_at = now()
where slug = 'about' and content::text like '%web submission form%';

update public.cms_pages
set content = replace(content::text, 'WhatsApp or web upload', 'WhatsApp or the Earth Talk chat')::jsonb,
    version = version + 1,
    updated_by = 'migration_056_chat_only_submission',
    updated_at = now()
where slug = 'privacy' and content::text like '%WhatsApp or web upload%';

update public.cms_pages
set content = replace(
      replace(content::text, 'Capture & Submit via WhatsApp or Web', 'Capture & Submit in the Earth Talk Chat'),
      'Send it directly to the Earth Talk WhatsApp line or upload via the web form.',
      'Send it in the Submit Field Observation chat in Earth Talk.'
    )::jsonb,
    version = version + 1,
    updated_by = 'migration_056_chat_only_submission',
    updated_at = now()
where slug = 'how_it_works'
  and (
    content::text like '%Capture & Submit via WhatsApp or Web%'
    or content::text like '%upload via the web form%'
  );

commit;
