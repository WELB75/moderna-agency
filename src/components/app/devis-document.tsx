import { Globe, AtSign, Link as LinkIcon, Mail, MapPin } from "lucide-react";
import { PhoneLink } from "@/components/app/phone-link";
import { Devis, devisTotal } from "@/lib/devis-types";

export function DevisDocument({ devis }: { devis: Devis }) {
  const total = devisTotal(devis);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold uppercase tracking-wide">{devis.titre || "Devis"}</h4>
      </div>

      {(devis.prestataireNom ||
        devis.prestataireTelephone ||
        devis.prestataireSite ||
        devis.prestataireEmail ||
        devis.prestataireInstagram ||
        devis.prestataireFacebook ||
        devis.prestataireAdresse) && (
        <div className="space-y-1 rounded-md bg-muted/40 p-2.5 text-sm">
          {devis.prestataireNom ? <p className="font-medium">{devis.prestataireNom}</p> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            {devis.prestataireTelephone ? <PhoneLink phone={devis.prestataireTelephone} /> : null}
            {devis.prestataireSite ? (
              <a
                href={devis.prestataireSite.startsWith("http") ? devis.prestataireSite : `https://${devis.prestataireSite}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                <Globe className="h-3.5 w-3.5" />
                Site web
              </a>
            ) : null}
            {devis.prestataireInstagram ? (
              <a
                href={`https://instagram.com/${devis.prestataireInstagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                <AtSign className="h-3.5 w-3.5" />
                Instagram
              </a>
            ) : null}
            {devis.prestataireFacebook ? (
              <a
                href={
                  devis.prestataireFacebook.startsWith("http")
                    ? devis.prestataireFacebook
                    : `https://facebook.com/${devis.prestataireFacebook}`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Facebook
              </a>
            ) : null}
            {devis.prestataireEmail ? (
              <a
                href={`mailto:${devis.prestataireEmail}`}
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                <Mail className="h-3.5 w-3.5" />
                {devis.prestataireEmail}
              </a>
            ) : null}
            {devis.prestataireAdresse ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {devis.prestataireAdresse}
              </span>
            ) : null}
          </div>
        </div>
      )}

      <div className="w-full text-sm">
        {devis.lignes.map((ligne, i) => (
          <div key={i} className="flex items-start justify-between gap-3 border-b py-1.5 last:border-0">
            <p className="min-w-0 flex-1 break-words">{ligne.description}</p>
            <p className="shrink-0 whitespace-nowrap font-medium">
              {ligne.prix} {devis.devise}
            </p>
          </div>
        ))}
        <div className="flex items-start justify-between gap-3 border-t-2 pt-1.5">
          <p className="shrink-0 font-semibold">Total</p>
          <p className="min-w-0 flex-1 break-words text-right font-bold">
            {devis.totalOverride || `${total} ${devis.devise}`}
          </p>
        </div>
      </div>

      {devis.note ? <p className="text-sm text-muted-foreground">{devis.note}</p> : null}

      <p className="hidden pt-2 text-right text-[10px] text-muted-foreground print:block">
        PDF généré par Moderna Agency
      </p>
    </div>
  );
}
