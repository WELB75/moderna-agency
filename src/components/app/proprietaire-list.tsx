import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { PhoneLink } from "@/components/app/phone-link";
import { User } from "lucide-react";

type Logement = {
  id: string;
  nom: string;
  numero: string;
  type: "villa" | "appartement";
  domaineNom: string | null;
  proprietaireNom: string | null;
  proprietaireTelephone: string | null;
};

export function ProprietaireList({ logements }: { logements: Logement[] }) {
  if (logements.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <User className="h-8 w-8" />
          <p>Aucun logement pour l&apos;instant.</p>
        </CardContent>
      </Card>
    );
  }

  const groups = new Map<string, Logement[]>();
  for (const l of logements) {
    const key = l.domaineNom ?? "Sans domaine";
    const list = groups.get(key) ?? [];
    list.push(l);
    groups.set(key, list);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([domaineNom, items]) => (
        <div key={domaineNom} className="space-y-2">
          {items[0].domaineNom ? (
            <DomaineBadge nom={domaineNom} />
          ) : (
            <p className="text-sm font-medium text-muted-foreground">{domaineNom}</p>
          )}
          {items.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3">
              <Link href={`/villas/${l.id}`} className="min-w-0 hover:opacity-80">
                <p className="truncate font-medium">{l.nom}</p>
                <p className="text-xs text-muted-foreground">
                  {l.type === "appartement" ? "Appartement" : "Villa"} n°{l.numero}
                </p>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-medium">{l.proprietaireNom ?? "Non renseigné"}</p>
                {l.proprietaireTelephone ? <PhoneLink phone={l.proprietaireTelephone} /> : null}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
