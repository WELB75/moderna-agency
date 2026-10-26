"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { appliquerCodeAction, chercherCodesAction, ignorerCodeAction } from "@/lib/actions/memoire-agent";

export type PropositionCode = { id: string; villaNom: string; type: "wifi" | "boitier" | "porte"; valeur: string; actuel: string | null };

const LIBELLES = { wifi: "Wifi", boitier: "Boîtier à clés", porte: "Porte d'entrée" } as const;

// Codes (wifi, boîtier, porte) retrouvés dans les messages déjà envoyés aux voyageurs. Proposés
// seulement : rien ne change sur la fiche d'un logement sans clic sur « Appliquer ».
export function CodesTrouves({ propositions }: { propositions: PropositionCode[] }) {
  const router = useRouter();
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function chercher() {
    setRecherche(true);
    setErreur(null);
    try {
      const b = await chercherCodesAction();
      if (b.erreurs.length > 0) setErreur(b.erreurs.slice(0, 3).join(" | "));
      toast[b.propositions > 0 ? "success" : "message"](
        b.propositions > 0 ? `${b.propositions} code(s) trouvé(s) à vérifier.` : `Aucun nouveau code trouvé (${b.logements} logement(s) avec des messages d'accès${b.deja ? `, ${b.deja} déjà à jour` : ""}).`
      );
      router.refresh();
    } catch {
      toast.error("Recherche impossible.");
    } finally {
      setRecherche(false);
    }
  }

  const parLogement = new Map<string, PropositionCode[]>();
  for (const p of propositions) parLogement.set(p.villaNom, [...(parLogement.get(p.villaNom) ?? []), p]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Codes retrouvés dans les messages</h2>
          <p className="text-sm text-muted-foreground">
            Wifi, code du boîtier et code de la porte, relevés dans les messages d&apos;arrivée déjà envoyés aux voyageurs. Rien n&apos;est
            modifié sans ton clic : compare avec la valeur actuelle de la fiche du logement puis applique.
          </p>
        </div>
        <Button variant="outline" onClick={chercher} disabled={recherche} className="max-md:h-11">
          <Search className={`h-4 w-4 ${recherche ? "animate-pulse" : ""}`} />
          Chercher les codes dans les messages
        </Button>
      </div>
      {erreur ? <p className="break-words rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{erreur}</p> : null}

      {parLogement.size === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Aucune proposition pour l&apos;instant.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...parLogement.entries()].map(([villaNom, liste]) => (
            <Card key={villaNom}>
              <CardContent className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="h-4 w-4 text-[#660033]" />
                  {villaNom}
                </h3>
                {liste.map((p) => (
                  <Ligne key={p.id} proposition={p} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Ligne({ proposition: p }: { proposition: PropositionCode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function agir(action: (id: string) => Promise<void>, succes: string) {
    startTransition(async () => {
      try {
        await action(p.id);
        toast.success(succes);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{LIBELLES[p.type]}</Badge>
        <span className="break-all font-mono text-xs">{p.valeur}</span>
      </div>
      <p className="text-xs text-muted-foreground">{p.actuel ? `Fiche actuelle : ${p.actuel}` : "Aucune valeur sur la fiche du logement."}</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => agir(appliquerCodeAction, "Code appliqué.")} className="bg-[#660033] text-white hover:bg-[#660033]/90 max-md:h-10">
          {p.actuel ? "Remplacer" : "Appliquer"}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => agir(ignorerCodeAction, "Proposition ignorée.")} className="max-md:h-10">
          Ignorer
        </Button>
      </div>
    </div>
  );
}
