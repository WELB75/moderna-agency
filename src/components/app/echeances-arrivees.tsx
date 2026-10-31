import { FileClock } from "lucide-react";
import { chargerArriveesDocuments, progressionFiche } from "@/lib/arrivees-documents";
import { calculerEcheance } from "@/lib/echeance-documents";
import { TuileEcheance } from "@/components/app/tuile-echeance";
import { SectionLabel } from "@/components/app/dashboard-ui";

// « Prochaines échéances » — Fouad, 2026-10-31 : « je voulais un vrai compteur qu'on voit tout le
// temps. Par exemple pour la villa Sophia j'ai une réservation vendredi prochain et j'aimerais
// bien avoir un compteur. » Le compte à rebours des cartes d'agenda n'était visible que dans la
// semaine affichée, et celui du bloc « Fiche police, contrat et caution » seulement une fois le
// bloc déplié.
//
// Ici : une tuile par arrivée des 10 prochains jours dont les documents ne sont pas tous réglés
// (fiche police complète + contrat signé), toujours visible dès l'ouverture, avec un gros compteur
// qui tourne en direct jusqu'à la limite J-1 (24 h avant l'arrivée, lib/echeance-documents.ts)
// et, dessous, ce qui manque : « Fiche police 2/4 » (passeports reçus / attendus, voir
// lib/arrivees-documents.ts) et « Contrat à signer ». Les arrivées déjà en ordre n'apparaissent
// pas : la bande est une liste de choses à surveiller, pas un agenda.
//
// Gris : on a le temps. Orange : moins de 24 h avant la limite. Rouge : limite dépassée / arrivé
// sans papiers. Les retards passent en tête, puis par date d'arrivée.

const NB_JOURS = 10;

export async function EcheancesArrivees({ now }: { now: Date }) {
  const arrivees = await chargerArriveesDocuments(now, NB_JOURS);
  const aSurveiller = arrivees
    .map((a) => ({ ...a, echeance: calculerEcheance({ checkIn: a.checkIn, ficheStatut: a.ficheStatut, contratStatut: a.contratStatut }, now) }))
    .filter((a) => a.echeance.etat !== "ok")
    .sort((a, b) => {
      const ua = a.echeance.tone === "urgent" ? 0 : 1;
      const ub = b.echeance.tone === "urgent" ? 0 : 1;
      return ua - ub || a.checkIn.getTime() - b.checkIn.getTime();
    });

  if (aSurveiller.length === 0) return null;

  return (
    <section aria-label="Prochaines échéances" className="space-y-2">
      <div className="flex items-center gap-2">
        <FileClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <SectionLabel>Prochaines échéances · fiche police et contrat avant J-1</SectionLabel>
      </div>
      {/* Défilement horizontal sur téléphone (une tuile = ~15rem), grille sur grand écran. */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
        {aSurveiller.map((a) => (
          <TuileEcheance
            key={a.id}
            reservationId={a.id}
            villaNom={a.villaNom ?? "Logement"}
            guestName={a.guestName}
            checkIn={a.checkIn}
            ficheStatut={a.ficheStatut}
            contratStatut={a.contratStatut}
            progressionFiche={progressionFiche(a.fiche)}
            ficheId={a.fiche?.id ?? null}
          />
        ))}
      </div>
    </section>
  );
}
