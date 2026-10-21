import { auth } from "@clerk/nextjs/server";
import { KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AccesEquipeGestion } from "@/components/app/acces-equipe";
import { statutAcces } from "@/lib/acces";
import { listerAcces } from "@/lib/actions/acces";

export const dynamic = "force-dynamic";

// Page Accès (2026-10-21) : qui peut ouvrir le back-office. Un compte inconnu qui se connecte
// apparaît ici "en attente" (il ne voit que /acces-refuse) jusqu'à ce qu'un administrateur le
// valide. Réservée aux administrateurs (Kamel et Fouad), voir src/lib/acces.ts.
export default async function AccesPage() {
  const { userId } = await auth();
  const moi = userId ? await statutAcces(userId) : null;

  if (!moi || moi.role !== "admin") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Accès</h1>
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <KeyRound className="h-5 w-5 shrink-0" />
            Cette page est réservée aux administrateurs (Kamel et Fouad).
          </CardContent>
        </Card>
      </div>
    );
  }

  const lignes = await listerAcces();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accès</h1>
        <p className="text-sm text-muted-foreground">
          Comptes qui peuvent ouvrir le back-office. Un nouveau compte reste bloqué tant qu&apos;il n&apos;est pas autorisé ici.
        </p>
      </div>
      <AccesEquipeGestion lignes={lignes} moiEmail={moi.email} />
    </div>
  );
}
