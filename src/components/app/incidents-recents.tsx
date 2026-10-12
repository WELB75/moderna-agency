import { INTERVENTION_STEPS, type Etape } from "@/lib/intervention-steps";

type Incident = {
  id: string;
  titre: string;
  villaNom: string | null;
  etape: Etape;
  signaleAt: Date;
};

const TIMEZONE = "Africa/Casablanca";

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

function dayLabel(date: Date, now: Date): string {
  const key = dayKey(date);
  if (key === dayKey(now)) return "Aujourd'hui";
  if (key === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long" }).format(date);
}

const MAX_LIGNES = 10;

function dateHeure(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(" ", " · ");
}

// Fil simple des 10 derniers incidents signalés : villa, titre, statut, date et heure.
export function IncidentsRecents({ incidents }: { incidents: Incident[] }) {
  const now = new Date();
  const recents = [...incidents]
    .sort((a, b) => new Date(b.signaleAt).getTime() - new Date(a.signaleAt).getTime())
    .slice(0, MAX_LIGNES);

  if (recents.length === 0) return null;

  const jours: { label: string; items: Incident[] }[] = [];
  for (const i of recents) {
    const label = dayLabel(new Date(i.signaleAt), now);
    const dernier = jours[jours.length - 1];
    if (dernier && dernier.label === label) dernier.items.push(i);
    else jours.push({ label, items: [i] });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Derniers signalements</h2>
      <div className="space-y-3 rounded-md border p-3">
        {jours.map((jour) => (
          <div key={jour.label} className="space-y-1">
            <p className="text-xs font-medium capitalize text-muted-foreground">{jour.label}</p>
            {jour.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <p className="min-w-0 truncate">
                  <span className="font-medium">{i.villaNom ?? "Villa inconnue"}</span>
                  <span className="text-muted-foreground"> · {i.titre}</span>
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dateHeure(new Date(i.signaleAt))} · {INTERVENTION_STEPS.find((s) => s.key === i.etape)?.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
