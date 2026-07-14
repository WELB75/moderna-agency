import { Users, Baby } from "lucide-react";

export function GuestCount({
  nbAdultes,
  nbEnfants,
}: {
  nbAdultes: number | null;
  nbEnfants: number | null;
}) {
  if (nbAdultes === null && nbEnfants === null) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 font-medium">
        <Users className="h-3.5 w-3.5" />
        {nbAdultes ?? 0} adulte{(nbAdultes ?? 0) > 1 ? "s" : ""}
      </span>
      {nbEnfants ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Baby className="h-3.5 w-3.5" />
          {nbEnfants} enfant{nbEnfants > 1 ? "s" : ""}
        </span>
      ) : null}
      <span className="text-xs text-muted-foreground">(adultes seuls sur la fiche gendarmerie)</span>
    </div>
  );
}
