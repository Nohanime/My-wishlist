alter table public.items
drop constraint if exists items_wishlist_id_fkey;

alter table public.items
add constraint items_wishlist_id_fkey
foreign key (wishlist_id)
references public.profiles (id)
on delete cascade;

create index if not exists items_wishlist_id_idx
on public.items (wishlist_id);
