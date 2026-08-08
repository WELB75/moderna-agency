import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toWhatsAppUrl } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type StaffAvailability = {
  id: string;
  nom: string;
  telephone: string | null;
  role: "menage" | "cuisine";
  occupeAujourdhui: boolean;
};

// Panneau "qui est libre, comment la joindre" sous le planning du lien public — Kamel,
// 2026-08-08 : "en un seul clic qu'on a le WhatsApp on peut la contacter". Le badge
// libre/occupée reflète uniquement aujourd'hui — quelqu'un d'occupé aujourd'hui reste contactable
// pour une mission plus tard dans la semaine.
export function PublicStaffAvailability({ staff }: { staff: StaffAvailability[] }) {
  const menage = staff.filter((s) => s.role === "menage");
  const cuisine = staff.filter((s) => s.role === "cuisine");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StaffColumn title="Femmes de ménage" dotColor="bg-orange-500" people={menage} />
      <StaffColumn title="Cuisinières" dotColor="bg-violet-500" people={cuisine} />
    </div>
  );
}

function StaffColumn({ title, dotColor, people }: { title: string; dotColor: string; people: StaffAvailability[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-xs text-muted-foreground">Personne d&apos;actif pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <div
                key={p.id}
                className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/30 py-1 pl-2.5 pr-1 text-xs"
              >
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.occupeAujourdhui ? "bg-red-500" : "bg-green-500")}
                  aria-hidden
                />
                <span className="font-medium">{p.nom}</span>
                <span className={cn("text-[10px]", p.occupeAujourdhui ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                  {p.occupeAujourdhui ? "Occupée" : "Libre"}
                </span>
                {p.telephone ? (
                  <a
                    href={toWhatsAppUrl(p.telephone)}
                    target="_blank"
                    rel="noreferrer"
                    title={p.telephone}
                    aria-label={`WhatsApp ${p.nom}`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                  >
                    <MessageCircle className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
