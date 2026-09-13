"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Gift,
  LoaderCircle,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setError("");

    try {
      const supabase = createClient();
      const result = isSignup
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name },
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (isSignup && !result.data.session) {
        setMessage(
          "Compte cree. Consultez votre boite mail pour confirmer votre adresse.",
        );
        setPassword("");
        return;
      }

      router.push("/");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible de contacter Supabase. Vérifiez votre connexion.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#f6f4ee] text-[#17201d]">
      <div className="pointer-events-none absolute -left-28 -top-28 size-72 rounded-full bg-[#d7e8d4] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 size-96 rounded-full bg-[#f0d7bb] blur-3xl" />

      <section className="relative hidden w-[43%] flex-col justify-between overflow-hidden bg-[#1f3b32] p-10 text-[#f6f4ee] lg:flex xl:p-16">
        <div className="absolute -right-24 top-20 size-80 rounded-full border border-[#d6e6c5]/20" />
        <div className="absolute -right-12 top-32 size-56 rounded-full border border-[#d6e6c5]/20" />
        <div className="relative flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em]">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#d6e6c5] text-[#1f3b32]">
            <Gift className="size-5" />
          </span>
          Wishlist
        </div>

        <div className="relative max-w-md">
          <p className="mb-5 flex items-center gap-2 text-sm font-medium text-[#d6e6c5]">
            <Sparkles className="size-4" />
            Les envies se partagent mieux ensemble
          </p>
          <h1 className="font-heading text-5xl font-semibold leading-[1.04] tracking-tight xl:text-6xl">
            Gardez une place pour les belles surprises.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-[#d6e6c5]/75">
            Creez votre wishlist familiale, ajoutez vos idees et laissez vos
            proches trouver le cadeau juste.
          </p>
        </div>

        <p className="relative text-sm text-[#d6e6c5]/55">
          Un espace simple pour les envies partagees.
        </p>
      </section>

      <section className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <Card className="w-full max-w-md border-[#d9ddd4] bg-[#fffdf8]/90 shadow-[0_24px_80px_-32px_rgba(31,59,50,0.35)] backdrop-blur-sm">
          <CardHeader className="gap-4 px-6 pb-2 pt-7 sm:px-8 sm:pt-8">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[#1f3b32] text-[#d6e6c5]">
                <Gift className="size-4" />
              </span>
              <span className="text-sm font-semibold uppercase tracking-[0.15em]">
                Wishlist
              </span>
            </div>
            <div>
              <CardTitle className="font-heading text-3xl font-semibold tracking-tight">
                {isSignup
                  ? "Votre wishlist commence ici"
                  : "Ravi de vous revoir"}
              </CardTitle>
              <CardDescription className="mt-2 text-[0.95rem] leading-6">
                {isSignup
                  ? "Un compte pour garder toutes vos envies au meme endroit."
                  : "Connectez-vous pour retrouver vos idees cadeaux."}
              </CardDescription>
            </div>
            <div
              className="grid grid-cols-2 rounded-xl bg-[#edf0e9] p-1"
              role="tablist"
              aria-label="Mode d'authentification"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isSignup}
                onClick={() => switchMode("login")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${!isSignup ? "bg-white text-[#1f3b32] shadow-sm" : "text-[#66716b] hover:text-[#1f3b32]"}`}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignup}
                onClick={() => switchMode("signup")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isSignup ? "bg-white text-[#1f3b32] shadow-sm" : "text-[#66716b] hover:text-[#1f3b32]"}`}
              >
                Inscription
              </button>
            </div>
          </CardHeader>

          <CardContent className="px-6 pb-7 pt-5 sm:px-8 sm:pb-8">
            <form className="space-y-4" onSubmit={handleSubmit}>
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nom</Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="Camille Martin"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    minLength={2}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.fr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      isSignup ? "new-password" : "current-password"
                    }
                    placeholder="8 caracteres minimum"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[#66716b] transition-colors hover:bg-[#edf0e9] hover:text-[#1f3b32]"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {(error || message) && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`rounded-lg px-3 py-2.5 text-sm leading-5 ${error ? "bg-red-50 text-red-700" : "bg-[#e6f1df] text-[#28533e]"}`}
                >
                  {error || message}
                </p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="h-10 w-full gap-2 bg-[#1f3b32] text-[#f6f4ee] hover:bg-[#2b5144]"
              >
                {isLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <>
                    {isSignup ? "Creer mon compte" : "Se connecter"}
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-[#78827c]">
              En continuant, vous acceptez de garder vos envies dans un espace
              reserve a votre famille.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
