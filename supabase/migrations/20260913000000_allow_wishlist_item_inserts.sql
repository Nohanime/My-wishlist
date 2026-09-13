alter table public.items enable row level security;

drop policy if exists "Owners can add wishlist items" on public.items;

create policy "Owners can add wishlist items"
on public.items
for insert
to authenticated
with check ((select auth.uid()) = wishlist_id);
