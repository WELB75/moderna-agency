import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { format } from "date-fns";
import { estMembreEquipe } from "@/lib/acces";
import { periodeAncre } from "@/lib/caisse-periode";
import { chargerRapportCompta, rapportEnCsv } from "@/lib/compta-rapport";

// Export Excel (CSV) du rapport par réservation, pour la comptable. Réservé à l'équipe.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!(await estMembreEquipe(userId))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const ancre = periodeAncre(req.nextUrl.searchParams.get("mois") ?? undefined);
  const rapport = await chargerRapportCompta(ancre);
  return new NextResponse(rapportEnCsv(rapport), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comptabilite-${format(ancre, "yyyy-MM")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
