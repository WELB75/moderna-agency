"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Languages, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { detecterLangueVoyageur } from "@/lib/actions/langue-voyageur";
import { toWhatsAppUrl } from "@/lib/phone";
import type { MessageLang } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

// Bouton d'envoi d'un modèle de message WhatsApp avec langue automatique (Fouad, 2026-10-31 :
// « que le système sache direct, au vu des messages précédents avec la cliente, sa langue »).
// Clic principal : la langue est déduite de ce que le voyageur a écrit (lib/actions/langue-voyageur.ts),
// français par défaut. Flèche : choix manuel FR/EN. Partagé par Bienvenue, Localisation, Courses ;
// le Message d'arrivée a sa propre version (il crée la fiche police au passage).
//
// La fenêtre WhatsApp est ouverte de façon synchrone au clic (sinon Safari la bloque) puis
// redirigée une fois la langue connue.
export function MessageLangueButton({
  reservationId,
  phone,
  icon: Icon,
  label,
  type,
  build,
  prominent,
  envoyeAt,
  copieToast = "Message copié : colle-le dans la conversation de la plateforme.",
}: {
  reservationId: string;
  phone: string | null;
  icon: LucideIcon;
  label: string;
  // Clé de marquerMessageEnvoye ("bienvenue", "localisation", "cuisine"...).
  type: Parameters<typeof marquerMessageEnvoye>[1];
  build: (lang: MessageLang) => string;
  prominent?: boolean;
  envoyeAt?: Date | null;
  copieToast?: string;
}) {
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));
  const [isPending, startTransition] = useTransition();

  function envoyer(lang: MessageLang | null) {
    const win = phone ? window.open("", "_blank") : null;
    startTransition(async () => {
      try {
        let langue: MessageLang = lang ?? "fr";
        if (!lang) {
          const detection = await detecterLangueVoyageur(reservationId).catch(() => null);
          if (detection?.langue) {
            langue = detection.messageLang;
            toast.info(`Message en ${langue === "fr" ? "français" : "anglais"} — ${detection.explication}.`);
          } else {
            toast.info("Aucun message du voyageur trouvé : envoi en français (la flèche permet de choisir).");
          }
        }
        const message = build(langue);
        if (phone) {
          const url = toWhatsAppUrl(phone, message);
          if (win) win.location.href = url;
          else window.open(url, "_blank");
        } else {
          await navigator.clipboard.writeText(message);
          toast.success(copieToast);
        }
        setEnvoye(true);
        marquerMessageEnvoye(reservationId, type).catch(() => {});
      } catch (err) {
        win?.close();
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  const classes = cn(
    prominent && "rounded-xl border-primary/30 py-5 text-primary hover:bg-primary/5",
    envoye && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
  );

  return (
    <div className={cn("flex items-stretch", prominent && "w-full")}>
      <Button
        type="button"
        variant="outline"
        size={prominent ? "default" : "sm"}
        disabled={isPending}
        title="Langue choisie automatiquement d'après les messages du voyageur"
        className={cn(classes, "rounded-r-none border-r-0", prominent && "flex-1 justify-start")}
        onClick={() => envoyer(null)}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {prominent ? <span className="flex-1 text-center">{label}</span> : label}
        <Languages className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={prominent ? "default" : "sm"}
            disabled={isPending}
            aria-label="Choisir la langue du message"
            title="Choisir la langue à la main"
            className={cn(classes, "rounded-l-none px-2")}
          >
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => envoyer(null)}>Automatique (d&apos;après ses messages)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => envoyer("fr")}>Français</DropdownMenuItem>
          <DropdownMenuItem onClick={() => envoyer("en")}>English</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
