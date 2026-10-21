"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ajouterAcces, changerRoleAcces, changerStatutAcces, type LigneAcces } from "@/lib/actions/acces";

function quand(iso: string | null): string | null {
  return iso ? format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr }) : null;
}

export function AccesEquipeGestion({ lignes, moiEmail }: { lignes: LigneAcces[]; moiEmail: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");

  function lancer(action: () => Promise<void>, succes: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(succes);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action impossible pour le moment.");
      }
    });
  }

  const enAttente = lignes.filter((l) => l.statut === "en_attente");
  const autorises = lignes.filter((l) => l.statut === "autorise");
  const refuses = lignes.filter((l) => l.statut === "refuse");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">En attente ({enAttente.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {enAttente.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun compte en attente.</p>
          ) : (
            enAttente.map((l) => (
              <Ligne key={l.id} ligne={l}>
                <Button size="sm" disabled={isPending} onClick={() => lancer(() => changerStatutAcces(l.id, "autorise"), `${l.nom ?? l.email} peut ouvrir le back-office.`)}>
                  Autoriser
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => lancer(() => changerStatutAcces(l.id, "refuse"), "Compte refusé.")}>
                  Refuser
                </Button>
              </Ligne>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autorisés ({autorises.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {autorises.map((l) => (
            <Ligne key={l.id} ligne={l} moi={l.email === moiEmail}>
              {l.permanent || l.email === moiEmail ? null : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      lancer(() => changerRoleAcces(l.id, l.role === "admin" ? "membre" : "admin"), l.role === "admin" ? "Compte passé membre." : "Compte passé administrateur.")
                    }
                  >
                    {l.role === "admin" ? "Passer membre" : "Passer administrateur"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => lancer(() => changerStatutAcces(l.id, "refuse"), "Accès retiré.")}>
                    Retirer l&apos;accès
                  </Button>
                </>
              )}
            </Ligne>
          ))}
        </CardContent>
      </Card>

      {refuses.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accès retirés ({refuses.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {refuses.map((l) => (
              <Ligne key={l.id} ligne={l}>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => lancer(() => changerStatutAcces(l.id, "autorise"), "Accès rétabli.")}>
                  Réautoriser
                </Button>
              </Ligne>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autoriser un compte à l&apos;avance</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const valeur = email;
              lancer(async () => {
                await ajouterAcces({ email: valeur, nom, role: "membre" });
                setEmail("");
                setNom("");
              }, `${valeur} pourra ouvrir le back-office dès sa connexion.`);
            }}
          >
            <Input type="email" required placeholder="adresse e-mail du compte" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="nom (facultatif)" value={nom} onChange={(e) => setNom(e.target.value)} />
            <Button type="submit" disabled={isPending || !email.trim()}>
              Autoriser
            </Button>
          </form>
          <p className="pt-2 text-xs text-muted-foreground">
            La personne se connecte ensuite avec cette même adresse (Google ou e-mail). Elle aura accès à tout le back-office, sans la page Accès.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Ligne({ ligne, moi, children }: { ligne: LigneAcces; moi?: boolean; children?: React.ReactNode }) {
  const tentative = quand(ligne.derniereTentative);
  const decision = quand(ligne.decideLe);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="break-all">{ligne.nom ?? ligne.email}</span>
          {ligne.role === "admin" ? <Badge variant="secondary">Administrateur</Badge> : null}
          {ligne.permanent ? <Badge variant="outline">Permanent</Badge> : null}
          {moi ? <Badge variant="outline">Vous</Badge> : null}
        </p>
        <p className="break-all text-xs text-muted-foreground">{ligne.email}</p>
        <p className="text-xs text-muted-foreground">
          {ligne.statut === "en_attente"
            ? tentative
              ? `Dernière tentative de connexion : ${tentative}`
              : "Pas encore connecté depuis la mise en place des accès"
            : decision && ligne.decidePar
              ? `${ligne.statut === "autorise" ? "Autorisé" : "Retiré"} par ${ligne.decidePar}, le ${decision}`
              : null}
        </p>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
