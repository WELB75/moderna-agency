"use client";

import { useState, useTransition } from "react";
import { MessageCircleMore, ChevronDown, Languages } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createGendarmerieForm } from "@/lib/actions/gendarmerie";
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildArrivalMessage, type MessageLang } from "@/lib/message-templates";
import { detecterLangueVoyageur } from "@/lib/actions/langue-voyageur";
import { cn } from "@/lib/utils";

// Un seul message, un seul bouton : demande l'horaire d'arrivée et, si la fiche de police
// n'est pas encore complétée, crée le formulaire si besoin et ajoute son lien dans le même
// message plutôt que d'envoyer deux messages séparés.
//
// 2026-10-31 (Fouad) : le clic principal choisit la langue tout seul d'après ce que le voyageur a
// écrit (fil Airbnb/Booking, WhatsApp — voir lib/actions/langue-voyageur.ts) : français s'il
// écrit en français, anglais sinon, français par défaut si on n'a aucun message de lui. La flèche
// garde le choix manuel FR/EN.
export function ArrivalMessageButton({
  reservationId,
  villaId,
  phone,
  guestName,
  checkIn,
  now,
  ficheId,
  ficheComplete,
  repasInclus = false,
  prominent,
  envoyeAt,
}: {
  reservationId: string;
  villaId: string;
  phone: string | null;
  guestName: string;
  checkIn: Date;
  now: Date;
  ficheId: string | null;
  ficheComplete: boolean;
  repasInclus?: boolean;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  const [id, setId] = useState(ficheId);
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));
  const [isPending, startTransition] = useTransition();

  // `lang` null = détection automatique d'après les messages du voyageur.
  function handleClick(lang: MessageLang | null) {
    // La fenêtre doit s'ouvrir de façon synchrone, dans le prolongement direct du clic —
    // sinon les navigateurs (Safari en particulier) ne la reconnaissent plus comme une
    // action utilisateur légitime et bloquent le passage vers l'app WhatsApp, laissant une
    // page vide bloquée sur l'écran de chargement WhatsApp. On ouvre donc un onglet vide
    // tout de suite, et on le redirige une fois le lien de fiche (éventuellement créé) prêt.
    // Sans numéro (ex. résa Airbnb importée par iCal, sans coordonnées) : pas de WhatsApp possible,
    // on copie le message pour le coller dans la conversation Airbnb.
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
        let ficheLink: string | null = null;
        if (!ficheComplete) {
          let formId = id;
          if (!formId) {
            const created = await createGendarmerieForm(reservationId, villaId);
            formId = created.id;
            setId(formId);
          }
          ficheLink = `${window.location.origin}/g/${formId}`;
        }
        const message = buildArrivalMessage(guestName, checkIn, now, ficheLink, langue, repasInclus);
        if (phone) {
          const url = toWhatsAppUrl(phone, message);
          if (win) win.location.href = url;
          else window.open(url, "_blank");
        } else {
          await navigator.clipboard.writeText(message);
          toast.success("Message copié : colle-le dans la conversation Airbnb.");
        }
        setEnvoye(true);
        marquerMessageEnvoye(reservationId, "arrivee").catch(() => {});
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
        onClick={() => handleClick(null)}
      >
        <MessageCircleMore className="h-3.5 w-3.5 shrink-0" />
        {prominent ? <span className="flex-1 text-center">Message d&apos;arrivée</span> : "Message d'arrivée"}
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
          <DropdownMenuItem onClick={() => handleClick(null)}>Automatique (d&apos;après ses messages)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleClick("fr")}>Français</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleClick("en")}>English</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
