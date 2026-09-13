"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Ajouter un cadeau (Seul le proprio peut le faire via les RLS)
export async function addItem(
  wishlistId: string,
  title: string,
  url?: string,
  imageUrl?: string,
  price?: number,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .insert([
      { wishlist_id: wishlistId, title, url, image_url: imageUrl, price },
    ]);
  if (error) throw new Error(error.message);
  revalidatePath(`/wishlist/${wishlistId}`);
}

// Réserver un cadeau (Tous sauf le propriétaire)
export async function toggleReserveItem(itemId: string, wishlistId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // On récupère l'état actuel de l'item
  const { data: item } = await supabase
    .from("items")
    .select("reserved_by_id")
    .eq("id", itemId)
    .single();

  // Si déjà réservé par quelqu'un d'autre, on bloque
  if (item?.reserved_by_id && item.reserved_by_id !== user.id) {
    throw new Error("Ce cadeau est déjà réservé par un autre membre");
  }

  // Toggle de la réservation
  const newReservedId = item?.reserved_by_id ? null : user.id;
  const { error } = await supabase
    .from("items")
    .update({ reserved_by_id: newReservedId })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidatePath(`/wishlist/${wishlistId}`);
}
