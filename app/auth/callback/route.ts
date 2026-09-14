import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  let next = "/";
  if (requestedNext) {
    try {
      const nextUrl = new URL(requestedNext, origin);
      if (nextUrl.origin === origin) {
        next = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      }
    } catch {
      // Use the home page when the requested destination is invalid.
    }
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.redirect(
          `${origin}/login?error=Session utilisateur introuvable`,
        );
      }

      const profileName =
        user.user_metadata?.name || user.email?.split("@")[0] || "Membre";

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, name: profileName });

      if (profileError) {
        return NextResponse.redirect(
          `${origin}/login?error=Impossible de creer votre profil`,
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(
    `${origin}/login?error=Could not authenticate user`,
  );
}
