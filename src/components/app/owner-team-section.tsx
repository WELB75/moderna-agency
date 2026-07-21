import { Badge } from "@/components/ui/badge";
import { PhoneLink } from "@/components/app/phone-link";
import { CONTACT_ROLE_LABELS } from "@/lib/contact-roles";

export type OwnerTeamRow = {
  id: string;
  role: string;
  nom: string;
  telephone: string | null;
};

export function OwnerTeamSection({ contacts }: { contacts: OwnerTeamRow[] }) {
  if (contacts.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun contact renseigné pour l&apos;instant.</p>;
  }

  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{CONTACT_ROLE_LABELS[c.role] ?? c.role}</Badge>
              <p className="font-medium">{c.nom}</p>
            </div>
          </div>
          {c.telephone ? <PhoneLink phone={c.telephone} /> : null}
        </div>
      ))}
    </div>
  );
}
