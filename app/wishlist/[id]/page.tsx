import Link from "next/link";
import { ArrowLeft, Gift, Sparkles } from "lucide-react";

import { AddGiftDialog } from "@/app/wishlist/add-gift-dialog";
import { toggleReserveItem } from "@/actions/wishlist-actions";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/server";

type Profile = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
};

type SecureItem = {
  id: string;
  title: string | null;
  image_url: string | null;
  price: number | null;
  url: string | null;
  is_reserved: boolean;
};

function getProfileName(profile: Profile) {
  return (
    profile.name ||
    profile.full_name ||
    profile.display_name ||
    "Membre de la famille"
  );
}

export default async function WishlistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: profile, error: profileError },
    { data: items, error: itemsError },
    { data: user },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase
      .from("secure_items")
      .select("id, title, image_url, price, url, is_reserved")
      .eq("profile_id", id)
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const wishlistProfile = profile as Profile | null;
  const wishlistItems = (items ?? []) as SecureItem[];
  const isOwner = user.user?.id === id;
  const error = profileError || itemsError;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f4ee] text-[#17201d]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,rgba(214,230,197,0.8),transparent_55%),radial-gradient(circle_at_top_right,rgba(240,215,187,0.7),transparent_50%)]" />
      <main className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#d9ddd4] pb-5">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Retour à l'accueil"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#1f3b32] text-[#d6e6c5] shadow-sm">
              <Gift className="size-5" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">
              Wishlist
            </span>
          </Link>
          <LogoutButton />
        </header>

        <section className="flex flex-col justify-between gap-6 pb-10 pt-14 md:flex-row md:items-end sm:pt-20">
          <div>
            <Link
              href="/"
              className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[#63805d] hover:text-[#1f3b32]"
            >
              <ArrowLeft className="size-4" /> Toutes les wishlists
            </Link>
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-[#63805d]">
              <Sparkles className="size-4" /> Les envies se partagent mieux
              ensemble
            </p>
            <h1 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight text-[#1f3b32] sm:text-6xl">
              {wishlistProfile
                ? getProfileName(wishlistProfile)
                : "Wishlist introuvable"}
            </h1>
            <p className="mt-5 text-base leading-7 text-[#66716b]">
              {wishlistProfile
                ? "Les idées cadeaux à garder en tête."
                : "Ce profil n'existe pas ou n'est plus disponible."}
            </p>
          </div>
          {isOwner && wishlistProfile && <AddGiftDialog profileId={id} />}
        </section>

        {error ? (
          <div className="rounded-2xl border border-[#e7c9c1] bg-[#fff8f5] px-5 py-4 text-sm text-[#9b4b3d]">
            Impossible de charger cette wishlist pour le moment.
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c8d1c5] bg-[#fffdf8]/70 px-6 py-12 text-center">
            <p className="font-heading text-xl font-semibold text-[#1f3b32]">
              Aucun cadeau pour le moment
            </p>
            <p className="mt-2 text-sm text-[#78827c]">
              Les envies ajoutées apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {wishlistItems.map((item) => (
              <article
                key={item.id}
                className={`overflow-hidden rounded-2xl border border-[#d9ddd4] bg-[#fffdf8] ${item.is_reserved ? "opacity-60" : ""}`}
              >
                <div className="aspect-4/3 bg-[#edf0e9]">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[#829184]">
                      <Gift className="size-10" />
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-heading text-xl font-semibold text-[#1f3b32]">
                      {item.title || "Cadeau sans titre"}
                    </h2>
                    {item.price != null && (
                      <span className="shrink-0 text-sm font-semibold text-[#63805d]">
                        {item.price.toFixed(2)} €
                      </span>
                    )}
                  </div>
                  {item.is_reserved ? (
                    <p className="text-sm font-medium text-[#78827c]">
                      Déjà réservé 🎁
                    </p>
                  ) : item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-[#477052] underline underline-offset-4 hover:text-[#1f3b32]"
                    >
                      Voir le cadeau
                    </a>
                  ) : null}
                  {!isOwner && (
                    <form action={toggleReserveItem.bind(null, item.id, id)}>
                      <button
                        type="submit"
                        disabled={item.is_reserved}
                        className="w-full rounded-xl bg-[#1f3b32] px-4 py-2.5 text-sm font-semibold text-[#f6f4ee] transition-colors hover:bg-[#315848] disabled:cursor-not-allowed disabled:bg-[#c8d1c5]"
                      >
                        {item.is_reserved
                          ? "Déjà réservé"
                          : "Réserver ce cadeau"}
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
