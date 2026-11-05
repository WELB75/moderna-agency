import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { KeyRound, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { WhatsAppAgenceConnexion } from "@/components/app/whatsapp-agence-connexion";
import { statutAcces } from "@/lib/acces";
import { META_APP_ID, META_ES_CONFIG_ID, lireConnexionAgence } from "@/lib/whatsapp-agence-connexion";

export const dynamic = "force-dynamic";

const DATE_HEURE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Casablanca",
});

// Accès > WhatsApp (2026-11-05) : brancher la ligne WhatsApp Business de l'agence
// (+212 6 68 73 09 09) dans la boîte Messages, à côté d'Airbnb et Booking.com, en "coexistence"
// (le téléphone garde l'application WhatsApp Business). Réservé aux administrateurs.
export default async function WhatsAppAgencePage() {
  const { userId } = await auth();
  const moi = userId ? await statutAcces(userId) : null;

  if (!moi || moi.role !== "admin") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp de l&apos;agence</h1>
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <KeyRound className="h-5 w-5 shrink-0" />
            Cette page est réservée aux administrateurs.
          </CardContent>
        </Card>
      </div>
    );
  }

  const connexion = await lireConnexionAgence().catch(() => null);
  const viaVariable = Boolean(process.env.WHATSAPP_AGENCE_PHONE_NUMBER_ID?.trim());
  const connecte = Boolean(connexion) || viaVariable;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp de l&apos;agence</h1>
        <p className="text-sm text-muted-foreground">
          Affiche les conversations du +212 6 68 73 09 09 dans{" "}
          <Link href="/chat" className="underline underline-offset-2">
            Messages
          </Link>
          , à côté d&apos;Airbnb et Booking.com. Le téléphone garde l&apos;application WhatsApp Business : rien ne change pour lui.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-sm">
              {connexion ? (
                <>
                  <p className="font-medium">
                    Connectée{connexion.numeroAffiche ? ` : ${connexion.numeroAffiche}` : ""}
                    {connexion.nomAffiche ? ` (${connexion.nomAffiche})` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    Le {DATE_HEURE.format(connexion.connecteLe)}
                    {connexion.connectePar ? ` par ${connexion.connectePar}` : ""}.
                  </p>
                  {connexion.historiqueErreur ? (
                    <p className="text-destructive">Import de l&apos;historique : {connexion.historiqueErreur}</p>
                  ) : connexion.historiqueDemandeLe ? (
                    <p className="text-muted-foreground">
                      Historique demandé à Meta le {DATE_HEURE.format(connexion.historiqueDemandeLe)} (jusqu&apos;à 6 mois, il arrive en quelques minutes).
                    </p>
                  ) : null}
                </>
              ) : viaVariable ? (
                <p className="font-medium">Connectée (identifiant défini dans Vercel).</p>
              ) : (
                <p className="font-medium">Pas encore connectée.</p>
              )}
            </div>
          </div>

          <WhatsAppAgenceConnexion appId={META_APP_ID} configId={META_ES_CONFIG_ID} dejaConnecte={connecte} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-5 text-sm">
          <p className="font-medium">Déroulé (5 minutes, avec le téléphone de l&apos;agence)</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Sur le téléphone : l&apos;application WhatsApp Business est à jour.</li>
            <li>Ici : « Connecter la ligne », se connecter à Facebook, choisir le portefeuille et le compte WhatsApp Moderna Agency.</li>
            <li>Choisir de connecter l&apos;application WhatsApp Business existante : un QR code s&apos;affiche.</li>
            <li>Le scanner avec WhatsApp Business sur le téléphone, puis accepter le partage de l&apos;historique.</li>
            <li>Le QR code expire vite : le scanner tout de suite.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
