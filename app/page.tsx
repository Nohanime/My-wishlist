import Link from "next/link";
import { ArrowUpRight, Gift, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

type Profile = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

function getProfileName(profile: Profile) {
  return (
    profile.name ||
    profile.full_name ||
    profile.display_name ||
    "Membre de la famille"
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function Home() {
  const supabase = await createClient();
  const { data: profiles, error } = await supabase.from("profiles").select("*");

  const familyProfiles = (profiles ?? []) as Profile[];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f4ee] text-[#17201d]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,rgba(214,230,197,0.8),transparent_55%),radial-gradient(circle_at_top_right,rgba(240,215,187,0.7),transparent_50%)]" />
      <main className="relative mx-auto w-full max-w-6xl px-5 pb-14 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#d9ddd4] pb-5">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Accueil Wishlist"
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

        <section className="pb-10 pt-14 sm:pt-20">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium text-[#63805d]">
            <Sparkles className="size-4" />
            Les envies se partagent mieux ensemble
          </p>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="max-w-2xl font-heading text-4xl font-semibold leading-[1.05] tracking-tight text-[#1f3b32] sm:text-6xl">
                Qui cherchez-vous à gâter ?
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#66716b]">
                Retrouvez les envies de toute la famille au même endroit.
              </p>
            </div>
            <p className="text-sm font-medium text-[#78827c]">
              {familyProfiles.length}{" "}
              {familyProfiles.length > 1 ? "membres" : "membre"}
            </p>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-[#e7c9c1] bg-[#fff8f5] px-5 py-4 text-sm text-[#9b4b3d]">
            Impossible de charger les profils pour le moment.
          </div>
        ) : familyProfiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c8d1c5] bg-[#fffdf8]/70 px-6 py-12 text-center">
            <p className="font-heading text-xl font-semibold text-[#1f3b32]">
              Aucun profil pour le moment
            </p>
            <p className="mt-2 text-sm text-[#78827c]">
              Les membres de votre famille apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className="grid auto-rows-[minmax(190px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {familyProfiles.map((profile, index) => {
              const name = getProfileName(profile);
              const isFeature = index === 0;

              return (
                <Link
                  key={profile.id}
                  href={`/wishlist/${profile.id}`}
                  className={`group relative flex min-h-48 flex-col justify-between overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_35px_-22px_rgba(31,59,50,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f3b32] ${
                    isFeature
                      ? "border-[#1f3b32] bg-[#1f3b32] text-[#f6f4ee] sm:col-span-2 lg:row-span-2"
                      : "border-[#d9ddd4] bg-[#fffdf8] text-[#1f3b32]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={`flex size-14 items-center justify-center rounded-2xl text-lg font-semibold ${isFeature ? "bg-[#d6e6c5] text-[#1f3b32]" : "bg-[#e6f1df] text-[#477052]"}`}
                    >
                      {profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.avatar_url}
                          alt=""
                          className="size-full rounded-2xl object-cover"
                        />
                      ) : (
                        getInitials(name)
                      )}
                    </div>
                    <ArrowUpRight
                      className={`size-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 ${isFeature ? "text-[#d6e6c5]" : "text-[#9aaa9a]"}`}
                    />
                  </div>
                  <div>
                    <p
                      className={`mb-1 text-xs font-medium uppercase tracking-[0.16em] ${isFeature ? "text-[#d6e6c5]/70" : "text-[#829184]"}`}
                    >
                      Wishlist {index + 1}
                    </p>
                    <h2 className="font-heading text-2xl font-semibold tracking-tight">
                      {name}
                    </h2>
                    <p
                      className={`mt-2 text-sm ${isFeature ? "text-[#f6f4ee]/65" : "text-[#78827c]"}`}
                    >
                      Voir sa liste d&apos;envies
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
