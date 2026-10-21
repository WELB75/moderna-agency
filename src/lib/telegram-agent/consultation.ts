import { eq, inArray, ne } from "drizzle-orm";
import { addDays, format, startOfDay } from "date-fns";
import { getDb } from "@/db";
import { villas, domaines, reservations, personnel, personnelAffectations } from "@/db/schema";
import { logementEstIntegre } from "@/lib/domaines-actifs";

// Outils de LECTURE de l'assistant Telegram : codes d'accès, qui est où, disponibilités,
// cuisinière/ménage. Kamel, 2026-10-21 : "j'interroge le bot telegram et il va tout chercher dans
// notre système et il répond". Réservé à Kamel (webhook verrouillé sur son identifiant).

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const jour = (d: Date) => format(d, "yyyy-MM-dd");

type VilleLogement = { id: string; nom: string; numero: string };

// Logements gérés aujourd'hui (les 16 hébergements), mêmes règles que le reste de l'app.
async function logementsGeres() {
  const rows = await getDb()
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
      beds24RoomId: villas.beds24RoomId,
      domaineNom: domaines.nom,
      codeBoitier: villas.codeBoitier,
      codePorteEntree: villas.codePorteEntree,
      codeChambreMaster: villas.codeChambreMaster,
      codeWifi: villas.codeWifi,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id));
  return rows.filter((v) => logementEstIntegre(v));
}

function trouverLogement<T extends VilleLogement>(liste: T[], recherche: string): T[] {
  const q = sansAccent(recherche);
  if (!q) return [];
  const exact = liste.filter((v) => sansAccent(v.nom) === q || v.numero === q.replace(/^n°?/, ""));
  if (exact.length) return exact;
  return liste.filter((v) => sansAccent(v.nom).includes(q) || q.includes(sansAccent(v.nom)));
}

export async function getVillaCodes(villaNom: string) {
  const liste = await logementsGeres();
  const trouves = trouverLogement(liste, villaNom);
  if (trouves.length === 0) return { erreur: "Logement introuvable.", logements: liste.map((v) => v.nom) };
  return {
    logements: trouves.map((v) => ({
      nom: v.nom,
      boitier: v.codeBoitier ?? "non renseigné",
      porteEntree: v.codePorteEntree ?? "non renseigné",
      chambreMaster: v.codeChambreMaster ?? "non renseigné",
      wifi: v.codeWifi ?? "non renseigné",
    })),
  };
}

type Sejour = { villaId: string; guestName: string; checkIn: Date; checkOut: Date; id: string };

async function sejoursActifs(): Promise<Sejour[]> {
  const rows = await getDb()
    .select({ id: reservations.id, villaId: reservations.villaId, guestName: reservations.guestName, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(ne(reservations.status, "annulee"));
  return rows.filter((r): r is Sejour => r.villaId !== null);
}

const estBlocage = (nom: string) => /blocage|bloqu/i.test(nom);

// Situation de chaque logement (ou d'un seul) à une date : qui arrive, qui part, qui est sur
// place, ou libre — avec cuisinière et ménage du séjour.
export async function getOccupation(dateStr: string, villaNom?: string) {
  const day = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(day.getTime())) return { erreur: "Date invalide." };
  const d = jour(day);

  let liste = await logementsGeres();
  if (villaNom) {
    liste = trouverLogement(liste, villaNom);
    if (liste.length === 0) return { erreur: "Logement introuvable." };
  }
  const ids = new Set(liste.map((v) => v.id));
  const sejours = (await sejoursActifs()).filter((s) => ids.has(s.villaId) && jour(s.checkIn) <= d && jour(s.checkOut) >= d);

  const affect = sejours.length
    ? await getDb()
        .select({ reservationId: personnelAffectations.reservationId, nom: personnel.nom, role: personnel.role })
        .from(personnelAffectations)
        .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
        .where(inArray(personnelAffectations.reservationId, sejours.map((s) => s.id)))
    : [];

  return {
    date: d,
    logements: liste.map((v) => {
      const ici = sejours.filter((s) => s.villaId === v.id);
      return {
        nom: v.nom,
        statut: ici.length === 0 ? "libre" : "occupé ou mouvement ce jour",
        sejours: ici.map((s) => ({
          client: estBlocage(s.guestName) ? `${s.guestName} (blocage, pas un client)` : s.guestName,
          arrivee: jour(s.checkIn),
          depart: jour(s.checkOut),
          ce_jour: jour(s.checkIn) === d && jour(s.checkOut) === d ? "arrive et repart" : jour(s.checkIn) === d ? "arrive" : jour(s.checkOut) === d ? "part" : "sur place",
          cuisiniere: affect.filter((a) => a.reservationId === s.id && a.role === "cuisine").map((a) => a.nom),
          menage: affect.filter((a) => a.reservationId === s.id && a.role === "menage").map((a) => a.nom),
        })),
      };
    }),
  };
}

// Logements libres sur toute la période [du, au[ (nuits). `au` absent = une seule nuit (`du`).
export async function getDisponibilites(du: string, au?: string) {
  const debut = new Date(`${du}T00:00:00`);
  if (Number.isNaN(debut.getTime())) return { erreur: "Date invalide." };
  const fin = au ? new Date(`${au}T00:00:00`) : addDays(debut, 1);
  if (Number.isNaN(fin.getTime()) || fin <= debut) return { erreur: "Période invalide." };
  const a = jour(startOfDay(debut));
  const b = jour(startOfDay(fin));

  const liste = await logementsGeres();
  const sejours = await sejoursActifs();
  // Une nuit est prise si checkIn < fin et checkOut > début (départ le jour même = libre).
  const libres = liste.filter((v) => !sejours.some((s) => s.villaId === v.id && jour(s.checkIn) < b && jour(s.checkOut) > a));
  return {
    du: a,
    au: b,
    libres: libres.map((v) => v.nom),
    occupes: liste.filter((v) => !libres.includes(v)).map((v) => v.nom),
  };
}
