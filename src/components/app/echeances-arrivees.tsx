import { FileClock } from "lucide-react";
import { chargerArriveesDocuments, progressionFiche } from "@/lib/arrivees-documents";
import { calculerEcheance } from "@/lib/echeance-documents";
import { ListeEcheances } from "@/components/app/liste-echeances";
import { SectionLabel } from "@/components/app/dashboard-ui";

// « Prochaines échéances » — Fouad, 2026-10-31 : « je voulais un vrai compteur qu'on voit tout le
// temps. Par exemple pour la villa Sophia j'ai une réservation vendredi prochain et j'aimerais
// bien avoir un compteur. » Le compte à rebours des cartes d'agenda n'était visible que dans la
// semaine affichée, et celui du bloc « Fiche police, contrat et caution » seulement une fois le
// bloc déplié.
//
// Ici : une ligne par arrivée des 30 prochains jours dont les documents ne sont pas tous réglés
// (fiche police complète + contrat signé), toujours visible dès l'ouverture, avec le compteur
// jusqu'à la limite J-1 (24 h avant l'arrivée, lib/echeance-documents.ts) et ce qui manque :
// « Passeports 2/4 » (reçus / attendus, voir lib/arrivees-documents.ts) et « Contrat ». Les
// arrivées déjà en ordre n'apparaissent pas : c'est une liste de choses à surveiller, pas un agenda.
//
// 2026-11-01, Fouad : la fenêtre de 10 jours était trop courte pour anticiper ; il veut voir au
// moins 20 jours d'arrivées à venir, les 5 premières lignes restant visibles comme avant et le
// reste derrière « Voir plus » (liste-echeances.tsx).
//
// 2026-10-31, deuxième passe : la première version (une carte par arrivée, gros chiffre, fond
// rouge) faisait « des gros blocs » sur PC. Désormais un seul bloc, une ligne par arrivée sur PC
// (liste-echeances.tsx), de petites bulles qui défilent au doigt sur téléphone ; le chrono ne tourne
// à la seconde que sous 24 h / en retard (ligne-echeance.tsx). Liseré bordeaux = villa, vert
// d'eau = appartement.
//
// Gris : on a le temps. Orange : moins de 24 h avant la limite. Rouge : limite dépassée / arrivé
// sans papiers. Les retards passent en tête, puis par date d'arrivée.

// Kamel, 2026-11-01 : « Voir plus » doit montrer tout le mois, donc 30 jours (et non plus 20).
const NB_JOURS = 30;

export async function EcheancesArrivees({ now }: { now: Date }) {
  const arrivees = await chargerArriveesDocuments(now, NB_JOURS);
  const aSurveiller = arrivees
    .map((a) => ({ ...a, echeance: calculerEcheance({ checkIn: a.checkIn, ficheStatut: a.ficheStatut, contratStatut: a.contratStatut }, now) }))
    .filter((a) => a.echeance.etat !== "ok")
    // Les 5 premières lignes sont les arrivées les plus proches (Kamel, 2026-11-01) ; les retards
    // sont de toute façon les plus proches, puisque la limite J-1 précède l'arrivée.
    .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

  if (aSurveiller.length === 0) return null;

  return (
    <section aria-label="Prochaines échéances" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <FileClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <SectionLabel>
            Prochaines échéances · fiche police et contrat avant J-1 · {aSurveiller.length}
          </SectionLabel>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary" aria-hidden />Villa</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-teal-500/80" aria-hidden />Appartement</span>
        </div>
      </div>
      <ListeEcheances
        lignes={aSurveiller.map((a) => ({
          reservationId: a.id,
          villaNom: a.villaNom ?? "Logement",
          villaType: a.villaType,
          guestName: a.guestName,
          checkIn: a.checkIn,
          ficheStatut: a.ficheStatut,
          contratStatut: a.contratStatut,
          progressionFiche: progressionFiche(a.fiche),
          ficheId: a.fiche?.id ?? null,
          ficheEnvoyee: a.ficheEnvoyee,
        }))}
      />
    </section>
  );
}
