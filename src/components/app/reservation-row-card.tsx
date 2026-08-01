import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/app/countdown";
import { GuestCount } from "@/components/app/guest-count";
import { PhoneLink } from "@/components/app/phone-link";
import { ArrivalMessageButton } from "@/components/app/arrival-message-button";
import { LocationMessageButton } from "@/components/app/location-message-button";
import { SecurityMessageButton } from "@/components/app/security-message-button";
import { EditReservationTimeDialog } from "@/components/app/edit-reservation-time-dialog";
import { ValidateCheckinCheckoutButton } from "@/components/app/validate-checkin-checkout-button";
import { StatusChip } from "@/components/app/status-chip";
import { PaymentSummary } from "@/components/app/payment-info";
import { PersonnelAffectationEditor, type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import {
  LogIn,
  LogOut,
  Info,
  KeyRound,
  DoorClosedLocked,
  FileText,
  FileSignature,
  Wallet,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";
import { phonesMatch } from "@/lib/phone";

export type ReservationRow = {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  source: string;
  canal: string | null;
  notes: string | null;
  nbAdultes: number | null;
  nbEnfants: number | null;
  guestPhone: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  villaId: string | null;
  villaType: "villa" | "appartement" | null;
  codeBoitier: string | null;
  codePorteEntree: string | null;
  personnelPayeParProprietaireNoms: string[];
  numeroImmeuble: string | null;
  proprietaireTelephone: string | null;
  domaineNom: string | null;
  domaineMapsUrl: string | null;
  domaineSecuritePhone: string | null;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  devisePaiement: string;
  checkinValideAt: Date | null;
  checkinValidePar: string | null;
  checkoutValideAt: Date | null;
  checkoutValidePar: string | null;
  aRelancer: boolean;
  ficheStatut: "complete" | "en_attente" | null;
  ficheId: string | null;
  contratStatut: "signe" | "en_attente" | null;
  menageAssignes: PersonnelAssigne[];
  cuisineAssignes: PersonnelAssigne[];
  menageOptions: { id: string; nom: string }[];
  cuisineOptions: { id: string; nom: string }[];
  cashAPrevoir: number;
  clientConnu: { nom: string; telephone: string | null; notes: string | null } | null;
};

// Carte de réservation complète et interactive (ménage/cuisine, validation check-in/out,
// documents, messages) — utilisée à la fois sur le tableau de bord (groupée par jour) et sur la
// fiche dédiée /reservations/[id] (arrivée avec la recherche globale), pour toujours retomber
// sur exactement la même vue, peu importe d'où on y accède.
export function ReservationRowCard({ r, kind }: { r: ReservationRow; kind: "in" | "out" }) {
  const target = kind === "in" ? new Date(r.checkIn) : new Date(r.checkOut);
  const isIn = kind === "in";
  const isProprietaire = phonesMatch(r.guestPhone, r.proprietaireTelephone);
  const isDone = Boolean(isIn ? r.checkinValideAt : r.checkoutValideAt);

  return (
    <div
      className={cn(
        "rounded-md border-l-4 transition-opacity",
        isIn ? "border-l-emerald-500" : "border-l-red-500",
        isDone && "opacity-60"
      )}
    >
      <Link href={r.villaId ? `/villas/${r.villaId}` : "#"} className="block space-y-2 p-3 hover:bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {isIn ? (
              <LogIn className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <p className="truncate font-medium">{r.guestName}</p>
            {isProprietaire ? <Badge variant="outline">Propriétaire</Badge> : null}
            {r.aRelancer ? <Badge variant="destructive">À relancer</Badge> : null}
          </div>
          <Countdown target={target} />
        </div>

        <div>
          <p className={cn("text-sm font-semibold", isIn ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
            {isIn ? "Check-in" : "Check-out"} · {format(target, "HH:mm", { locale: fr })}
            {isIn ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (départ le {format(new Date(r.checkOut), "d MMM", { locale: fr })})
              </span>
            ) : null}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground">
              {r.villaNom
                ? `${r.villaNom} (${r.villaType === "appartement" ? "appt" : "villa"} n°${r.villaNumero})`
                : "Logement non renseigné"}
            </span>
            {r.villaType === "appartement" && r.numeroImmeuble ? (
              <Badge variant="outline" className="text-xs">
                Immeuble {r.numeroImmeuble}
              </Badge>
            ) : null}
            {r.codeBoitier ? (
              <Badge variant="outline" className="gap-1 text-xs font-semibold tracking-wide" title="Code du boîtier à clés">
                <KeyRound className="h-3 w-3" />
                {r.codeBoitier}
              </Badge>
            ) : null}
            {r.codePorteEntree ? (
              <Badge
                variant="outline"
                className="gap-1 text-xs font-semibold tracking-wide"
                title="Code de la poignée tactile de la porte d'entrée"
              >
                <DoorClosedLocked className="h-3 w-3" />
                {r.codePorteEntree}
              </Badge>
            ) : null}
            {r.canal ? <span className="text-xs text-muted-foreground">· {r.canal}</span> : null}
          </div>
        </div>

        <GuestCount nbAdultes={r.nbAdultes} nbEnfants={r.nbEnfants} />

        {(isIn && r.clientConnu) || (kind === "out" && r.cashAPrevoir > 0) || r.notes ? (
          <div className="space-y-1">
            {isIn && r.clientConnu ? (
              <InlineAlert tone="blue" icon={UserCheck}>
                Client connu ({r.clientConnu.nom}){r.clientConnu.notes ? ` — ${r.clientConnu.notes}` : ""}
              </InlineAlert>
            ) : null}
            {kind === "out" && r.cashAPrevoir > 0 ? (
              <InlineAlert tone="amber" icon={Wallet}>
                Cash à prévoir : {r.cashAPrevoir} MAD
              </InlineAlert>
            ) : null}
            {r.notes ? (
              <InlineAlert tone="amber" icon={Info}>
                {r.notes}
              </InlineAlert>
            ) : null}
          </div>
        ) : null}
      </Link>

      {/* En dehors du Link (bouton cliquable dans une carte cliquable = navigation
          accidentelle). Un seul statut ménage/cuisine à la fois : le ménage se fait après un
          départ, la cuisine se prépare pour une arrivée. */}
      <div className="space-y-2 px-3 pb-3">
        {kind === "out" ? (
          <PersonnelAffectationEditor
            reservationId={r.id}
            role="menage"
            label="Ménage — cliquer sur le nom pour confirmer fait"
            assigned={r.menageAssignes}
            options={r.menageOptions}
            payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
          />
        ) : (
          <PersonnelAffectationEditor
            reservationId={r.id}
            role="cuisine"
            label="Cuisine"
            assigned={r.cuisineAssignes}
            options={r.cuisineOptions}
            payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {r.guestPhone ? <PhoneLink phone={r.guestPhone} /> : <span />}
          <ValidateCheckinCheckoutButton
            reservationId={r.id}
            kind={kind}
            valideAt={kind === "in" ? r.checkinValideAt : r.checkoutValideAt}
            validePar={kind === "in" ? r.checkinValidePar : r.checkoutValidePar}
          />
        </div>
      </div>

      <div className="space-y-3 border-t px-3 pb-3 pt-3">
          {isProprietaire ? null : (
            <div className="flex flex-wrap gap-1.5">
              <StatusChip
                icon={FileText}
                label="Fiche police"
                value={r.ficheStatut === "complete" ? "Faite" : r.ficheStatut === "en_attente" ? "En attente" : "Manquante"}
                done={r.ficheStatut === "complete"}
              />
              <StatusChip
                icon={FileSignature}
                label="Contrat"
                value={r.contratStatut === "signe" ? "Signé" : r.contratStatut === "en_attente" ? "En attente" : "Manquant"}
                done={r.contratStatut === "signe"}
              />
            </div>
          )}

          {isProprietaire ? null : (
            <PaymentSummary
              loyerTotal={r.loyerTotal}
              montantPaye={r.montantPaye}
              caution={r.caution}
              cautionPayee={r.cautionPayee}
              devisePaiement={r.devisePaiement}
            />
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {r.guestPhone && kind === "in" && !isProprietaire && r.villaId ? (
              <ArrivalMessageButton
                reservationId={r.id}
                villaId={r.villaId}
                phone={r.guestPhone}
                guestName={r.guestName}
                checkIn={new Date(r.checkIn)}
                now={nowInMorocco()}
                ficheId={r.ficheId}
                ficheComplete={r.ficheStatut === "complete"}
              />
            ) : null}
            {r.guestPhone && kind === "in" && !isProprietaire && r.domaineMapsUrl ? (
              <LocationMessageButton
                phone={r.guestPhone}
                guestName={r.guestName}
                domaineNom={r.domaineNom ?? "domaine"}
                mapsUrl={r.domaineMapsUrl}
              />
            ) : null}
            {r.villaId && r.domaineSecuritePhone ? (
              <SecurityMessageButton
                securityPhone={r.domaineSecuritePhone}
                guestName={r.guestName}
                villaNom={r.villaNom ?? "Villa"}
                villaNumero={r.villaNumero ?? "?"}
                villaId={r.villaId}
              />
            ) : null}
          </div>

          <EditReservationTimeDialog
            reservationId={r.id}
            checkIn={new Date(r.checkIn)}
            checkOut={new Date(r.checkOut)}
          />
      </div>
    </div>
  );
}

// Bandeau compact et cohérent pour les trois alertes de carte (client connu, cash à prévoir,
// notes) : fond neutre partout, seule l'icône porte la couleur — évite l'effet "mur de blocs
// colorés" quand plusieurs alertes s'accumulent sur une même réservation.
function InlineAlert({
  tone,
  icon: Icon,
  children,
}: {
  tone: "amber" | "blue";
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5 border border-border bg-muted/40 px-2 py-1 text-sm">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground"
        )}
      />
      <span>{children}</span>
    </div>
  );
}
