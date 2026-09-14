"use client";

import { ClipboardPaste, Gift, LoaderCircle, Plus } from "lucide-react";
import {
  startTransition,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";

import { scrapeProductData } from "@/actions/scraper";
import { addItem } from "@/actions/wishlist-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type ProductData = {
  title: string;
  image_url: string;
  price: number | null;
  url: string;
};

export function AddGiftDialog({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ProductData>({
    title: "",
    image_url: "",
    price: null,
    url: "",
  });
  const [isScraping, setIsScraping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleUrlPaste(event: ClipboardEvent<HTMLInputElement>) {
    const url = event.clipboardData.getData("text").trim();
    if (!url) return;
    event.preventDefault();
    setProduct((current) => ({ ...current, url }));
    setIsScraping(true);
    setError("");
    try {
      const result = await scrapeProductData(url);
      setProduct(result);
    } catch {
      setError("Impossible de récupérer les informations de ce lien.");
    } finally {
      setIsScraping(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    startTransition(async () => {
      try {
        await addItem(
          profileId,
          product.title,
          product.url,
          product.image_url,
          product.price ?? undefined,
        );
        setProduct({
          title: "",
          image_url: "",
          price: null,
          url: "",
        });
        setOpen(false);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Impossible d'ajouter ce cadeau.",
        );
      } finally {
        setIsSaving(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-[#1f3b32] text-[#f6f4ee] hover:bg-[#315747]">
            <Plus /> Ajouter un cadeau
          </Button>
        }
      />
      <DialogContent className="border-[#d9ddd4] bg-[#fffdf8] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#1f3b32]">
            Ajouter une envie
          </DialogTitle>
          <DialogDescription>
            Collez un lien pour récupérer automatiquement les informations du
            cadeau.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="gift-url">URL du cadeau</Label>
            <div className="relative">
              <Input
                id="gift-url"
                type="url"
                value={product.url}
                onChange={(event) =>
                  setProduct({ ...product, url: event.target.value })
                }
                onPaste={handleUrlPaste}
                placeholder="https://..."
                required
              />
              <ClipboardPaste className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#829184]" />
            </div>
            {isScraping && (
              <p className="flex items-center gap-2 text-xs text-[#63805d]">
                <LoaderCircle className="size-3 animate-spin" /> Récupération
                des informations...
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gift-title">Nom</Label>
            <Input
              id="gift-title"
              value={product.title}
              onChange={(event) =>
                setProduct({ ...product, title: event.target.value })
              }
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gift-price">Prix</Label>
              <Input
                id="gift-price"
                type="number"
                min="0"
                step="0.01"
                value={product.price ?? ""}
                onChange={(event) =>
                  setProduct({
                    ...product,
                    price: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gift-image">Image URL</Label>
              <Input
                id="gift-image"
                type="url"
                value={product.image_url}
                onChange={(event) =>
                  setProduct({ ...product, image_url: event.target.value })
                }
              />
            </div>
          </div>
          {error && <p className="text-sm text-[#9b4b3d]">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSaving || isScraping}>
              <Gift /> {isSaving ? "Ajout..." : "Ajouter à ma wishlist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
