import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { technicians, interventions, villas, domaines } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { Card, CardContent } from "@/components/ui/card";
import { TechnicianInterventionCard } from "@/components/app/technician-intervention-card";
import { sortByUrgence } from "@/lib/intervention-urgence";

export default async function TechnicianAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const [technician] = await db
    .select({ id: technicians.id, nom: technicians.nom, fonction: technicians.fonction })
    .from(technicians)
    .where(eq(technicians.accessToken, token))
    .limit(1);

  if (!technician) notFound();

  const assigned = await db
    .select({
      id: interventions.id,
      titre: interventions.titre,
      probleme: interventions.probleme,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineNom: domaines.nom,
      domaineMapsUrl: domaines.mapsUrl,
      urgence: interventions.urgence,
      etape: interventions.etape,
      attachmentUrls: interventions.attachmentUrls,
      createdAt: interventions.createdAt,
    })
    .from(interventions)
    .leftJoin(villas, eq(interventions.villaId, villas.id))
    .leftJoin(domaines, eq(interventions.domaineId, domaines.id))
    .where(eq(interventions.technicianId, technician.id));

  const enCours = sortByUrgence(assigned.filter((i) => i.etape !== "termine"));
  const terminees = sortByUrgence(assigned.filter((i) => i.etape === "termine"));

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2 pb-2">
        <Logo size={40} />
        <p className="text-xs text-muted-foreground">
          Espace technicien / مساحة الفني
        </p>
      </div>

      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{technician.nom}</h1>
        <p className="text-sm text-muted-foreground">{technician.fonction}</p>
      </div>

      {enCours.length === 0 && terminees.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aucune intervention assignée pour l&apos;instant / لا توجد مهام حاليا
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {enCours.map((i) => (
            <TechnicianInterventionCard key={i.id} token={token} intervention={i} />
          ))}
        </div>
      )}

      {terminees.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Terminé / تم الإنجاز
          </p>
          {terminees.map((i) => (
            <TechnicianInterventionCard key={i.id} token={token} intervention={i} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
