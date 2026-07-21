import { and, asc, desc, eq } from "drizzle-orm";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, domaines, reservations, contratsLocation } from "@/db/schema";
import { formatDateFr } from "@/lib/format-date";
import { nowInMorocco } from "@/lib/now";
import type { VillaSecurityData } from "@/components/app/villa-security-block";

// Pour l'instant, la sécurité ne concerne que les villas (pas les appartements Noria) :
// chaque domaine a ses propres agents, il ne faut jamais mélanger les deux.
const DOMAINES_SECURITE = ["Domaine Zaraba", "Domaine Moderna II"];

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
  const arriveeAujourdhui = form?.checkIn ? isSameDay(new Date(form.checkIn), nowInMorocco()) : false;

  return {
    villaId: villa.id,
    villaNom: villa.nom,
    villaNumero: villa.numero,
    arrivee,
    depart,
    nbAdultes,
    nbEnfants,
    occupants,
    arriveeAujourdhui,
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

export async function getSecuriteDomaines(): Promise<{ id: string; nom: string }[]> {
  const db = getDb();
  const rows = await db.select({ id: domaines.id, nom: domaines.nom }).from(domaines);
  return rows
    .filter((d) => DOMAINES_SECURITE.includes(d.nom))
    .sort((a, b) => DOMAINES_SECURITE.indexOf(a.nom) - DOMAINES_SECURITE.indexOf(b.nom));
}

export async function getVillasSecurityDataForDomaine(
  domaineId: string,
  options?: { jourSeulement?: boolean }
): Promise<{ domaineNom: string; villas: VillaSecurityData[] } | null> {
  const db = getDb();
  const [domaine] = await db.select({ id: domaines.id, nom: domaines.nom }).from(domaines).where(eq(domaines.id, domaineId));
  if (!domaine) return null;

  const domaineVillas = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero })
    .from(villas)
    .where(and(eq(villas.domaineId, domaineId), eq(villas.type, "villa")))
    .orderBy(asc(villas.numero));

  let villaList = await Promise.all(domaineVillas.map((v) => buildVillaSecurityData(db, v)));
  if (options?.jourSeulement) {
    villaList = villaList.filter((v) => v.arriveeAujourdhui);
  }

  return { domaineNom: domaine.nom, villas: villaList };
}
