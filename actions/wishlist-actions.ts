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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée. Veuillez vous reconnecter.");
  if (user.id !== wishlistId) {
    throw new Error("Vous ne pouvez modifier que votre propre wishlist.");
  }
  if (!title.trim()) throw new Error("Le nom du cadeau est obligatoire.");
  for (const candidate of [url, imageUrl]) {
    if (!candidate) continue;
    const parsedUrl = new URL(candidate);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Les liens doivent utiliser HTTP ou HTTPS.");
    }
  }

  const { error } = await supabase.from("items").insert([
    {
      wishlist_id: wishlistId,
      title: title.trim(),
      url,
      image_url: imageUrl,
      price,
    },
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
  if (user.id === wishlistId) {
    throw new Error("Le propriétaire ne peut pas réserver sa propre wishlist.");
  }

  // On récupère l'état actuel de l'item
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("reserved_by_id")
    .eq("id", itemId)
    .eq("wishlist_id", wishlistId)
    .single();
  if (itemError || !item) throw new Error("Ce cadeau n'existe plus.");

  // Si déjà réservé par quelqu'un d'autre, on bloque
  if (item.reserved_by_id && item.reserved_by_id !== user.id) {
    throw new Error("Ce cadeau est déjà réservé par un autre membre");
  }

  // Toggle de la réservation
  const newReservedId = item.reserved_by_id ? null : user.id;
  const { error } = await supabase
    .from("items")
    .update({ reserved_by_id: newReservedId })
    .eq("id", itemId)
    .eq("wishlist_id", wishlistId);

  if (error) throw new Error(error.message);
  revalidatePath(`/wishlist/${wishlistId}`);
}
