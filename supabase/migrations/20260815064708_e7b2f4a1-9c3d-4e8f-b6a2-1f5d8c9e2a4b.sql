-- Teil 2 (Veranstaltungen): Storage-Bucket für hochgeladene Ausschreibungs-PDFs.
-- Ablage unter "<user_id>/<event_id>/<dateiname>.pdf" – RLS auf storage.objects
-- spiegelt das gleiche "own <table>"-Muster wie events/event_schedule/event_stages,
-- nur über den Pfad-Präfix statt eine user_id-Spalte (Storage-Objekte haben keine).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-ausschreibungen', 'event-ausschreibungen', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "own event pdf select"
on storage.objects for select to authenticated
using (bucket_id = 'event-ausschreibungen' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own event pdf insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'event-ausschreibungen' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own event pdf update"
on storage.objects for update to authenticated
using (bucket_id = 'event-ausschreibungen' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'event-ausschreibungen' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own event pdf delete"
on storage.objects for delete to authenticated
using (bucket_id = 'event-ausschreibungen' and (storage.foldername(name))[1] = auth.uid()::text);
