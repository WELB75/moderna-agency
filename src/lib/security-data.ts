import { and, asc, desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, domaines, reservations, contratsLocation } from "@/db/schema";
import { formatDateFr } from "@/lib/format-date";
import type { VillaSecurityData } from "@/components/app/villa-security-block";

async function buildVillaSecurityData(
  db: ReturnType<typeof getDb>,
  villa: { id: string; nom: string; numero: string }
): Promise<VillaSecurityData> {
  const [form] = await db
    .select({
      id: gendarmerieForms.id,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      contratDateArrivee: contratsLocation.dateArrivee,
      contratDateDepart: contratsLocation.dateDepart,
      contratNbAdultes: contratsLocation.nbAdultes,
      contratNbEnfants: contratsLocation.nbEnfants,
    })
    .from(gendarmerieForms)
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .leftJoin(contratsLocation, eq(gendarmerieForms.contratId, contratsLocation.id))
    .where(and(eq(gendarmerieForms.villaId, villa.id), eq(gendarmerieForms.statut, "complete")))
    .orderBy(desc(gendarmerieForms.completedAt))
    .limit(1);

  const occupants = form
    ? await db
        .select({
          id: gendarmerieOccupants.id,
          nom: gendarmerieOccupants.nom,
          prenom: gendarmerieOccupants.prenom,
          nationalite: gendarmerieOccupants.nationalite,
          photoPieceUrl: gendarmerieOccupants.photoPieceUrl,
        })
        .from(gendarmerieOccupants)
        .where(eq(gendarmerieOccupants.formId, form.id))
        .orderBy(gendarmerieOccupants.createdAt)
    : [];

  const arrivee = form?.checkIn
    ? format(new Date(form.checkIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(form?.contratDateArrivee ?? "") || null;
  const depart = form?.checkOut
    ? format(new Date(form.checkOut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(form?.contratDateDepart ?? "") || null;
  const nbAdultes = form?.nbAdultes ?? form?.contratNbAdultes ?? null;
  const nbEnfants = form?.nbEnfants ?? form?.contratNbEnfants ?? 0;

  return {
    villaId: villa.id,
    villaNom: villa.nom,
    villaNumero: villa.numero,
    arrivee,
    depart,
    nbAdultes,
    nbEnfants,
    occupants,
  };
}

export async function getVillaSecurityData(villaId: string): Promise<VillaSecurityData | null> {
  const db = getDb();
  const [villa] = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);
  if (!villa) return null;
  return buildVillaSecurityData(db, villa);
}

export async function getAllVillasSecurityData(): Promise<
  { domaineNom: string; villas: VillaSecurityData[] }[]
> {
  const db = getDb();
  const allVillas = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, domaineNom: domaines.nom })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .orderBy(asc(villas.numero));

  const byDomaine = new Map<string, VillaSecurityData[]>();
  for (const v of allVillas) {
    const key = v.domaineNom ?? "Sans domaine";
    const data = await buildVillaSecurityData(db, v);
    if (!byDomaine.has(key)) byDomaine.set(key, []);
    byDomaine.get(key)!.push(data);
  }

  return Array.from(byDomaine.entries()).map(([domaineNom, villaList]) => ({ domaineNom, villas: villaList }));
}
