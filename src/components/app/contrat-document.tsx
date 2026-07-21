import { AGENCE_ADRESSE, AGENCE_NOM, CONTRAT_ARTICLES_FIXES } from "@/lib/contrat-template";
import { LinkifiedText } from "@/components/app/linkified-text";
import { formatDateFr } from "@/lib/format-date";

export type ContratDocumentData = {
  villaNom: string | null;
  villaNumero: string | null;
  villaAdresse: string | null;
  agenceRepresentant: string;
  locataireNom: string | null;
  locataireAdresse: string | null;
  dateArrivee: string | null;
  dateDepart: string | null;
  devise: string;
  montantTotal: string | null;
  acompteMontant: string | null;
  soldeMontant: string | null;
  soldeDateLimite: string | null;
  depotGarantieMontant: string | null;
  depotRestitutionDate: string | null;
  lieuSignature: string;
  dateSignatureAgence: string | null;
};

function blanc(value: string | null | undefined) {
  return value && value.trim() ? value : "……………………";
}

function blancDate(value: string | null | undefined) {
  const formatted = formatDateFr(value);
  return formatted || "……………………";
}

function montant(value: string | null | undefined, devise: string) {
  return value && value.trim() ? `${value.trim()} ${devise}` : "……………………";
}

export function ContratDocument({ contrat }: { contrat: ContratDocumentData }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <h1 className="text-center text-lg font-bold uppercase tracking-wide">
        Contrat de location saisonnière
      </h1>

      <p>
        Entre les soussignés :
        <br />
        {AGENCE_NOM}, sise à {AGENCE_ADRESSE}, représentée par {blanc(contrat.agenceRepresentant)},
        ci-après dénommée « L&apos;Agence »,
        <br />
        Et {blanc(contrat.locataireNom)}, demeurant à {blanc(contrat.locataireAdresse)}, ci-après
        dénommé « Le Locataire ».
      </p>

      <p>Il a été convenu et arrêté ce qui suit :</p>

      <div>
        <p className="font-semibold">Article 1 : Objet du contrat</p>
        <p>
          L&apos;Agence, agissant au nom et pour le compte du propriétaire de l&apos;appartement/villa{" "}
          {blanc(contrat.villaNom ? `${contrat.villaNom}${contrat.villaNumero ? ` (n°${contrat.villaNumero})` : ""}` : null)}{" "}
          située à{" "}
          {contrat.villaAdresse && contrat.villaAdresse.trim() ? (
            <LinkifiedText text={contrat.villaAdresse} />
          ) : (
            "……………………"
          )}{" "}
          au Maroc, loue ladite villa au Locataire pour une durée déterminée.
        </p>
      </div>

      <div>
        <p className="font-semibold">Article 2 : Durée de la location</p>
        <p>
          La location est consentie pour une période allant du {blancDate(contrat.dateArrivee)} au{" "}
          {blancDate(contrat.dateDepart)}, sans tacite reconduction.
        </p>
      </div>

      <div>
        <p className="font-semibold">Article 3 : Prix et modalités de paiement</p>
        <p>
          Le montant total de la location est fixé à {montant(contrat.montantTotal, contrat.devise)},
          payable de la manière suivante :
          <br />- Acompte à la réservation, soit {montant(contrat.acompteMontant, contrat.devise)}
          <br />- Solde de {montant(contrat.soldeMontant, contrat.devise)} à verser au plus tard le{" "}
          {blanc(contrat.soldeDateLimite)}
        </p>
        <p className="mt-2">
          En cas d&apos;annulation par le Locataire, l&apos;acompte reste acquis au propriétaire.
          <br />
          En cas de non-paiement du solde à la date convenue, l&apos;Agence se réserve le droit
          d&apos;annuler la réservation sans remboursement de l&apos;acompte. Aucun accès à
          l&apos;appartement ne sera autorisé sans paiement intégral.
        </p>
      </div>

      <div>
        <p className="font-semibold">Article 4 : Dépôt de garantie</p>
        <p>
          Le Locataire versera un dépôt de garantie de{" "}
          {montant(contrat.depotGarantieMontant, contrat.devise)} lors de son arrivée, destiné à
          couvrir d&apos;éventuels dégâts.
          <br />
          Ce dépôt sera restitué le {blanc(contrat.depotRestitutionDate)}, déduction faite des
          éventuelles réparations ou pertes.
        </p>
      </div>

      {CONTRAT_ARTICLES_FIXES.map((article) => (
        <div key={article.titre}>
          <p className="font-semibold">{article.titre}</p>
          {article.paragraphes.map((p, i) =>
            p ? (
              <p key={i}>{p}</p>
            ) : (
              <div key={i} className="h-2" />
            )
          )}
        </div>
      ))}

      <p>
        Fait à {contrat.lieuSignature}, le {blanc(contrat.dateSignatureAgence)}
        <br />
        En deux exemplaires originaux, un pour chaque partie.
      </p>
    </div>
  );
}
