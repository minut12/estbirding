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
    elsif coalesce(new.title_et, '') = '' or coalesce(new.body_et, '') = '' then
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
      new.translated_at := null;
      new.translate_hash := null;
      new.translation_error := null;
      new.translation_status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_news_items_translation_queue on public.news_items;

create trigger trg_news_items_translation_queue
before insert or update on public.news_items
for each row
execute function public.news_items_translation_queue();
