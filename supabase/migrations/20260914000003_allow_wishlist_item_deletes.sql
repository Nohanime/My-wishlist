drop policy if exists "Owners can delete wishlist items" on public.items;

create policy "Owners can delete wishlist items"
on public.items
for delete
to authenticated
using ((select auth.uid()) = wishlist_id);
