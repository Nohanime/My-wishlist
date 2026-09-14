drop policy if exists "Chacun modifie ses propres cadeaux" on public.items;
drop policy if exists "N'importe qui sauf le propriétaire peut réserver" on public.items;

create policy "Members can reserve wishlist items"
on public.items
for update
to authenticated
using (
  (select auth.uid()) <> wishlist_id
  and (reserved_by_id is null or reserved_by_id = (select auth.uid()))
)
with check (
  (select auth.uid()) <> wishlist_id
  and (reserved_by_id is null or reserved_by_id = (select auth.uid()))
);
