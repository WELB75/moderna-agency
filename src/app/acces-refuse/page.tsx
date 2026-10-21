import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Logo, Wordmark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BoutonDeconnexion } from "@/components/app/bouton-deconnexion";
import { statutAcces, type AccesEquipe } from "@/lib/acces";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accès — Superhosts" };

// Page vue par un compte connecté qui ne fait pas (ou plus) partie de l'équipe : src/proxy.ts y
// redirige toute page du back-office tant que le compte n'est pas autorisé dans la page Accès.
export default async function AccesRefusePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let acces: AccesEquipe | null = null;
  try {
    acces = await statutAcces(userId);
  } catch (err) {
    console.error("Contrôle d'accès impossible :", err);
  }

  const autorise = acces?.autorise === true;
  let titre: string;
  let texte: string;
  if (autorise) {
    titre = "Votre accès est validé";
    texte = "Vous pouvez ouvrir le back-office.";
  } else if (!acces) {
    titre = "Vérification impossible pour le moment";
    texte = "Le contrôle de votre accès n'a pas abouti. Réessayez dans un instant.";
  } else if (acces.statut === "non_verifie") {
    titre = "Adresse e-mail non vérifiée";
    texte = "Confirmez l'adresse e-mail de ce compte, puis reconnectez-vous.";
  } else if (acces.statut === "refuse") {
    titre = "Accès retiré";
    texte = "Ce compte n'a plus accès au back-office Superhosts. Contactez Kamel ou Fouad si c'est une erreur.";
  } else {
    titre = "Accès en attente de validation";
    texte =
      "Ce compte n'a pas encore accès au back-office Superhosts. Kamel ou Fouad doit le valider dans la page Accès ; rechargez ensuite cette page.";
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-6 flex items-center gap-2">
        <Logo size={36} />
        <Wordmark className="text-xl" />
      </div>
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            {autorise ? (
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
            ) : (
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
            )}
            <div className="min-w-0 space-y-1">
              <h1 className="text-lg font-semibold">{titre}</h1>
              <p className="text-sm text-muted-foreground">{texte}</p>
              {acces?.email ? (
                <p className="break-all pt-1 text-sm">
                  Compte : <span className="font-medium">{acces.email}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant={autorise ? "default" : "outline"}>
              <Link href="/dashboard">{autorise ? "Ouvrir le tableau de bord" : "Réessayer"}</Link>
            </Button>
            {!autorise ? <BoutonDeconnexion /> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
