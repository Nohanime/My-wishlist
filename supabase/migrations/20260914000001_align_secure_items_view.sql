create or replace view public.secure_items
with (security_invoker = true)
as
select
  i.id,
  i.wishlist_id,
  i.title,
  i.url,
  i.image_url,
  i.price,
  case
    when p.id = (select auth.uid()) then null::uuid
    else i.reserved_by_id
  end as reserved_by_id,
  (i.reserved_by_id is not null) as is_reserved
from public.items as i
join public.profiles as p on p.id = i.wishlist_id;
