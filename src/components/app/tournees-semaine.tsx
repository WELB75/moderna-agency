import { addDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Leaf, Waves } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { estRepos, jourSemaineNumero, passagesDuJour, texteLieu, type EquipierTournee } from "@/lib/tournees-format";
import { cn } from "@/lib/utils";

// Planning hebdomadaire de Brahim (jardinier) et Rachid (pisciniste), jour par jour pour la semaine
// affichée dans l'onglet Planning. Le planning est le même chaque semaine (planning papier
// « HEBDOMADAIRE », reporté ici le 2026-11-03) ; l'assistant Telegram répond aux mêmes questions
// (« où est Brahim jeudi ? »).
export function TourneesSemaine({ equipiers, debutSemaine, now }: { equipiers: EquipierTournee[]; debutSemaine: Date; now: Date }) {
  if (equipiers.length === 0) return null;
  const jours = Array.from({ length: 7 }, (_, i) => addDays(debutSemaine, i));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Jardinier et pisciniste</CardTitle>
        <p className="text-sm text-muted-foreground">Tournées de la semaine, identiques chaque semaine.</p>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {jours.map((date) => {
          const jour = jourSemaineNumero(date);
          const aujourdhui = isSameDay(date, now);
          return (
            <div key={date.toISOString()} className={cn("grid gap-1.5 py-2.5 md:grid-cols-[9rem_1fr]", aujourdhui && "-mx-2 rounded-lg bg-primary/5 px-2")}>
              <p className="text-sm font-medium capitalize">
                {format(date, "EEEE d MMM", { locale: fr })}
                {aujourdhui ? <span className="ml-2 text-xs font-normal text-primary">aujourd&apos;hui</span> : null}
              </p>
              <div className="space-y-1.5">
                {equipiers.map((e) => {
                  const passages = passagesDuJour(e, jour);
                  const Icone = e.metier === "jardinier" ? Leaf : Waves;
                  return (
                    <div key={e.id} className="flex items-start gap-2 text-sm">
                      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <p>
                        <span className="font-medium">{e.nom}</span>
                        <span className="text-muted-foreground"> ({e.metier}) · </span>
                        {passages.length === 0 ? (
                          <span className="text-muted-foreground">rien de prévu</span>
                        ) : (
                          passages.map((p, i) => (
                            <span key={i} className={cn(estRepos(p) && "text-muted-foreground")}>
                              {i > 0 ? " ; " : ""}
                              {texteLieu(p)}
                            </span>
                          ))
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
