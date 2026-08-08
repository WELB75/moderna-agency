import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhoneLink } from "@/components/app/phone-link";
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
      <CardContent className="space-y-1.5">
        {people.length === 0 ? (
          <p className="text-xs text-muted-foreground">Personne d&apos;actif pour l&apos;instant.</p>
        ) : (
          people.map((p) => (
            <div
              key={p.id}
              className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/30 px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{p.nom}</span>
                <Badge
                  className={cn(
                    "shrink-0 border text-[10px]",
                    p.occupeAujourdhui
                      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                      : "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                  )}
                >
                  {p.occupeAujourdhui ? "Occupée aujourd'hui" : "Libre"}
                </Badge>
              </div>
              {p.telephone ? <PhoneLink phone={p.telephone} className="w-fit shrink-0" /> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
