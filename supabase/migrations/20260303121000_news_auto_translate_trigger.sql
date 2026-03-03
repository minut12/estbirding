create table if not exists public.news_translation_queue (
  news_item_id uuid primary key references public.news_items(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_attempt_at timestamptz
);

create index if not exists news_translation_queue_status_idx
  on public.news_translation_queue (status, queued_at asc);

create or replace function public.enqueue_news_translation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.title_et, '') = '' or coalesce(new.body_et, '') = '' then
      insert into public.news_translation_queue (news_item_id, status, queued_at, updated_at)
      values (new.id, 'pending', now(), now())
      on conflict (news_item_id) do update
      set status = 'pending',
          updated_at = now();
    end if;
    return new;
  end if;

  if (coalesce(new.title, '') is distinct from coalesce(old.title, '')
      or coalesce(new.body, '') is distinct from coalesce(old.body, '')
      or coalesce(new.title_et, '') = ''
      or coalesce(new.body_et, '') = '')
  then
    insert into public.news_translation_queue (news_item_id, status, queued_at, updated_at)
    values (new.id, 'pending', now(), now())
    on conflict (news_item_id) do update
    set status = 'pending',
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_news_translation on public.news_items;

create trigger trg_enqueue_news_translation
after insert or update of title, body, title_et, body_et on public.news_items
for each row
execute function public.enqueue_news_translation();

insert into public.news_translation_queue (news_item_id, status, queued_at, updated_at)
select ni.id, 'pending', now(), now()
from public.news_items ni
where coalesce(ni.title_et, '') = '' or coalesce(ni.body_et, '') = ''
on conflict (news_item_id) do nothing;
