import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Disposition réelle du domaine confirmée par Kamel : 2 rangées de 7 villas
// de part et d'autre de la rue centrale (1-2, 3-4 ... 13-14), puis 15-16-17 au fond.
const ROWS: number[][] = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16, 17],
];

export type PlanVilla = {
  id: string;
  nom: string;
  position: number;
  libre: boolean;
};

export function DomainePlanModernaII({ villas }: { villas: PlanVilla[] }) {
  const byPosition = new Map(villas.map((v) => [v.position, v]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan du domaine — Moderna II</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
            Occupée
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
            Non gérée par nous
          </span>
        </div>

        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          ↓ Entrée du domaine
        </p>

        <div className="mx-auto max-w-sm space-y-1.5">
          {ROWS.map((row, i) =>
            row.length === 2 ? (
              <div key={i} className="grid grid-cols-[1fr_3px_1fr] items-stretch gap-1.5">
                <PlanSlot villa={byPosition.get(row[0])} position={row[0]} />
                <span className="rounded-full bg-border" />
                <PlanSlot villa={byPosition.get(row[1])} position={row[1]} />
              </div>
            ) : (
              <div key={i} className="grid grid-cols-3 gap-1.5">
                {row.map((n) => (
                  <PlanSlot key={n} villa={byPosition.get(n)} position={n} />
                ))}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanSlot({ villa, position }: { villa: PlanVilla | undefined; position: number }) {
  const classes = cn(
    "flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2.5 text-center transition-colors",
    !villa && "border-border bg-muted/30 text-muted-foreground",
    villa?.libre && "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
    villa && !villa.libre && "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/15"
  );

  const content = (
    <>
      <span className="text-xs font-semibold">n°{position}</span>
      <span className="truncate text-[10px] leading-tight">{villa ? villa.nom : "Non gérée"}</span>
    </>
  );

  if (!villa) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <Link href={`/villas/${villa.id}`} className={classes}>
      {content}
    </Link>
  );
}
