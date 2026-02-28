create or replace view public.news_items_v as
select
  ni.*,
  ns.name as source_name
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;
