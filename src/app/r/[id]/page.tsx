import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { reservations, villas, gendarmerieForms, contratsLocation, personnel, personnelAffectations } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { Card, CardContent } from "@/components/ui/card";
import { GuestCount } from "@/components/app/guest-count";
import { StatusChip } from "@/components/app/status-chip";
import { PhoneLink } from "@/components/app/phone-link";
import { FileText, FileSignature, Sparkles, ChefHat, Info, CalendarClock } from "lucide-react";

// Lien de partage en lecture seule pour un séjour donné (ex. transmis à Imane sur WhatsApp) :
// reprend exactement ce qui est affiché sur la carte du tableau de bord, sans avoir à se
// connecter — même logique que les liens sécurité/gendarmerie déjà utilisés dans l'app.
export default async function ReservationSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [r] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      notes: reservations.notes,
      guestPhone: reservations.guestPhone,
      canal: reservations.canal,
      villaId: reservations.villaId,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, id))
    .limit(1);

  if (!r) notFound();

  const [fiche] = await db
    .select({ statut: gendarmerieForms.statut })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.reservationId, r.id))
    .orderBy(desc(gendarmerieForms.createdAt))
    .limit(1);

  const villaContrats = r.villaId
    ? await db
        .select({ statut: contratsLocation.statut, dateArrivee: contratsLocation.dateArrivee })
        .from(contratsLocation)
        .where(eq(contratsLocation.villaId, r.villaId))
    : [];
  const checkInDay = format(new Date(r.checkIn), "yyyy-MM-dd");
  const contrat = villaContrats.find((c) => c.dateArrivee === checkInDay);

  const affectations = await db
    .select({ nom: personnel.nom, role: personnel.role })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
    .where(eq(personnelAffectations.reservationId, r.id));
  const menageNoms = affectations.filter((a) => a.role === "menage").map((a) => a.nom);
  const cuisineNoms = affectations.filter((a) => a.role === "cuisine").map((a) => a.nom);

  return (
    <div className="mx-auto min-h-screen max-w-xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={56} />
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
          Infos séjour
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          <div>
            <p className="text-lg font-semibold">
              {r.villaNom ? `${r.villaNom} (villa n°${r.villaNumero})` : "Villa non renseignée"}
            </p>
            <p className="text-sm text-muted-foreground">{r.guestName}{r.canal ? ` · ${r.canal}` : ""}</p>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 text-sm">
            <p>
              <span className="text-muted-foreground">Check-in : </span>
              <span className="font-medium">{format(new Date(r.checkIn), "EEEE d MMMM 'à' HH:mm", { locale: fr })}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Check-out : </span>
              <span className="font-medium">{format(new Date(r.checkOut), "EEEE d MMMM 'à' HH:mm", { locale: fr })}</span>
            </p>
          </div>

          <GuestCount nbAdultes={r.nbAdultes} nbEnfants={r.nbEnfants} />

          <div className="flex flex-wrap gap-1.5">
            <StatusChip
              icon={FileText}
              label="Fiche police"
              value={fiche?.statut === "complete" ? "Faite" : fiche ? "En attente" : "Manquante"}
              done={fiche?.statut === "complete"}
            />
            <StatusChip
              icon={FileSignature}
              label="Contrat"
              value={contrat?.statut === "signe" ? "Signé" : contrat ? "En attente" : "Manquant"}
              done={contrat?.statut === "signe"}
            />
            <StatusChip
              icon={Sparkles}
              label="Ménage"
              value={menageNoms.length > 0 ? menageNoms.join(", ") : "Non affecté"}
              done={menageNoms.length > 0}
            />
            {cuisineNoms.length > 0 ? (
              <StatusChip icon={ChefHat} label="Cuisine" value={cuisineNoms.join(", ")} done />
            ) : null}
          </div>

          {r.notes ? (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{r.notes}</span>
            </div>
          ) : null}

          {r.guestPhone ? <PhoneLink phone={r.guestPhone} /> : null}
        </CardContent>
      </Card>

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de partage Moderna Agency</p>
    </div>
  );
}
