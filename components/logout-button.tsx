"use client";

import { useState } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      aria-label="Se déconnecter"
      onClick={handleLogout}
      disabled={isLoading}
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[#66716b] transition-colors hover:bg-white/70 hover:text-[#1f3b32] disabled:opacity-60"
    >
      {isLoading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      <span className="hidden sm:inline">Se déconnecter</span>
    </button>
  );
}
