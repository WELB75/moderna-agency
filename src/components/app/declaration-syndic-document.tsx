import { DECLARANT_SYNDIC, type DeclarationSyndic } from "@/lib/syndic";
import { cn } from "@/lib/utils";

// Le document « Déclaration sur l'honneur » (même mise en page que le modèle papier), partagé entre
// la page interne (aperçu + impression) et le lien public envoyé au syndic.
export function DeclarationSyndicDocument({ d, prete = true }: { d: DeclarationSyndic; prete?: boolean }) {
  // Au moins six lignes, comme sur le modèle papier, pour pouvoir compléter à la main au besoin.
  const lignes = Math.max(6, d.personnes.length);
  return (
  <div
    className={cn(
      "rounded-xl border bg-white p-6 text-black shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none",
      !prete && "opacity-60 print:opacity-100"
    )}
    style={{ fontFamily: "'Times New Roman', Times, serif" }}
  >
    <div className="space-y-1 text-center text-base font-bold uppercase underline sm:text-lg">
      <p>Syndicat des copropriétaires</p>
      <p>{d.syndic?.entete ?? "…………………………………………"}</p>
    </div>

    <p className="mt-10 text-center text-base font-bold uppercase underline sm:text-lg">Déclaration sur l&apos;honneur</p>

    <div className="mt-10 space-y-4 text-[15px] leading-relaxed">
      <p>
        Je soussigné Copropriétaire M./Mme/Mlle : <span className="font-semibold">{DECLARANT_SYNDIC.nom}</span>
      </p>
      <p>
        N° CIN ou PPORT : <span className="font-semibold">{DECLARANT_SYNDIC.piece}</span>
        <span className="ml-10">Délivré à : {DECLARANT_SYNDIC.delivreA || "………………"}</span>
      </p>
      <p>Déclare sur l&apos;honneur que les personnes ci-après :</p>

      <ul className="space-y-3 pl-6">
        {Array.from({ length: lignes }, (_, i) => d.personnes[i] ?? null).map((p, i) => (
          <li key={p?.id ?? `vide-${i}`} className="flex flex-wrap items-baseline gap-x-3">
            <span className="w-2 shrink-0">▪</span>
            <span className="min-w-[16rem] flex-1 border-b border-dotted border-black/60 pb-0.5">
              {p ? p.nom : " "}
            </span>
            <span className="shrink-0">N° CIN/PP :</span>
            <span className="w-44 border-b border-dotted border-black/60 pb-0.5">
              {p ? p.piece || (p.enfant ? "mineur" : " ") : " "}
            </span>
          </li>
        ))}
      </ul>

      <p className="pt-4">
        Sont destinés à loger dans mon appartement : N°
        <span className="mx-1 inline-block min-w-12 border-b border-dotted border-black/60 text-center font-semibold">
          {d.numeroAppartement ?? " "}
        </span>
        Immeuble N°
        <span className="mx-1 inline-block min-w-12 border-b border-dotted border-black/60 text-center font-semibold">
          {d.numeroImmeuble ?? " "}
        </span>
      </p>
      <p>
        Située à la résidence <span className="font-semibold">{d.syndic?.residence ?? "………………"}</span> Durant la période :
      </p>
      <p>
        DU <span className="mx-1 font-semibold underline">{d.du}</span>
        <span className="mx-6">Au</span>
        <span className="font-semibold underline">{d.au}</span>.
      </p>

      <p className="pt-2 indent-8">
        Je désengage le syndic de toute responsabilité en cas de litige entre le propriétaire et le locataire ou
        invité. Ces derniers sont tenus de respecter le règlement interne de la copropriété affiché à
        l&apos;entrée de l&apos;immeuble.
      </p>

      <p className="pt-8 text-right">
        Fait à Marrakech, le <span className="font-semibold">{d.faitLe}</span>
      </p>
    </div>
  </div>
  );
}
