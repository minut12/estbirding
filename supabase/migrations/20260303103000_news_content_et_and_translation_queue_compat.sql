alter table public.news_items
  add column if not exists content_et text,
  add column if not exists title_et text,
  add column if not exists translated_at timestamptz,
  add column if not exists translation_error text;

create index if not exists idx_news_items_source_key_published_desc
  on public.news_items (source_key, published_at desc);

update public.news_items
set content_et = body_et
where content_et is null
  and body_et is not null;

create or replace function public.news_items_translation_queue()
returns trigger
language plpgsql
as $$
declare
  normalized_lang text;
begin
  normalized_lang := lower(split_part(coalesce(new.source_lang, new.lang, new.language, ''), '-', 1));

  if tg_op = 'INSERT' then
    if coalesce(new.source_key, '') = 'eoy' or normalized_lang = 'et' then
      if coalesce(new.translation_status, '') = '' or new.translation_status = 'pending' then
        new.translation_status := 'done';
      end if;
    elsif coalesce(new.title_et, '') = '' or (coalesce(new.body_et, '') = '' and coalesce(new.content_et, '') = '') then
      new.translation_status := 'pending';
    end if;
    return new;
  end if;

  if coalesce(new.title, '') is distinct from coalesce(old.title, '')
    or coalesce(new.body, '') is distinct from coalesce(old.body, '')
  then
    if coalesce(new.source_key, '') <> 'eoy' and normalized_lang <> 'et' then
      new.title_et := null;
      new.body_et := null;
      new.content_et := null;
      new.translated_at := null;
      new.translate_hash := null;
      new.translation_error := null;
      new.translation_status := 'pending';
    end if;
  end if;

  return new;
end;
$$;
