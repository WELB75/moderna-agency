import Link from "next/link";
import { format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/app/countdown";
import { GuestCount } from "@/components/app/guest-count";
import { ArrivalMessageButton } from "@/components/app/arrival-message-button";
import { WelcomeMessageButton } from "@/components/app/welcome-message-button";
import { LocationMessageButton } from "@/components/app/location-message-button";
import { SecurityMessageButton } from "@/components/app/security-message-button";
import { CheckoutMessageButton } from "@/components/app/checkout-message-button";
import { DepartureMessageButton } from "@/components/app/departure-message-button";
import { StayRatingButton } from "@/components/app/stay-rating-button";
import { EditReservationTimeDialog } from "@/components/app/edit-reservation-time-dialog";
import { ValidateCheckinCheckoutButton } from "@/components/app/validate-checkin-checkout-button";
import { StatusChip } from "@/components/app/status-chip";
import { PaymentSummary } from "@/components/app/payment-info";
import { PersonnelAffectationEditor, type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import { GuestWhatsAppButton } from "@/components/app/guest-whatsapp-button";
import { EditGuestPhoneButton } from "@/components/app/edit-guest-phone-button";
import {
  LogIn,
  LogOut,
  Info,
  KeyRound,
  DoorClosedLocked,
  BedDouble,
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
  codeChambreMaster: string | null;
  repasInclusDansLoyer: boolean;
  personnelPayeParProprietaireNoms: string[];
  numeroImmeuble: string | null;
  proprietaireTelephone: string | null;
  domaineNom: string | null;
  domaineMapsUrl: string | null;
  domaineWazeUrl: string | null;
  domaineSecuritePhone: string | null;
  guideBienvenueUrl: string | null;
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
  menageSejourAssignes: PersonnelAssigne[];
  menageDepartAssignes: PersonnelAssigne[];
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
//
// Habillage "verre dépoli" façon Apple (fond translucide flouté, coins arrondis, ombre douce),
// validé par Kamel après essai sur l'accueil — 2026-08-16 : "j'aime beaucoup donc fait ça
// partout maintenant".
export function ReservationRowCard({ r, kind }: { r: ReservationRow; kind: "in" | "out" }) {
  const target = kind === "in" ? new Date(r.checkIn) : new Date(r.checkOut);
  const isIn = kind === "in";
  const isProprietaire = phonesMatch(r.guestPhone, r.proprietaireTelephone);
  const isDone = Boolean(isIn ? r.checkinValideAt : r.checkoutValideAt);

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border bg-white/55 shadow-[0_8px_30px_rgb(0,0,0,0.08)] backdrop-blur-xl backdrop-saturate-150 transition-opacity dark:bg-white/8",
        isIn ? "border-emerald-400/40 dark:border-emerald-400/20" : "border-red-400/40 dark:border-red-400/20",
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
            {/* Icône WhatsApp juste à côté du nom (Kamel, 2026-08-16), pas seulement en bas de
                carte. Composant client à part : ReservationRowCard est rendu côté serveur, qui
                ne peut pas passer de onClick directement à un élément. */}
            {r.guestPhone ? <GuestWhatsAppButton phone={r.guestPhone} guestName={r.guestName} /> : null}
            <EditGuestPhoneButton reservationId={r.id} guestPhone={r.guestPhone} />
            {isProprietaire ? <Badge variant="outline">Propriétaire</Badge> : null}
            {r.aRelancer ? <Badge variant="destructive">À relancer</Badge> : null}
          </div>
          <Countdown target={target} />
        </div>

        <div>
          <p className={cn("text-sm font-semibold", isIn ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
            {isIn ? "Check-in" : "Check-out"} · {format(target, "d MMM", { locale: fr })} à {format(target, "HH:mm", { locale: fr })}
            {isIn ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (départ le {format(new Date(r.checkOut), "d MMM", { locale: fr })}
                {(() => {
                  const nuits = differenceInCalendarDays(new Date(r.checkOut), new Date(r.checkIn));
                  return ` · ${nuits + 1} jour${nuits + 1 > 1 ? "s" : ""} / ${nuits} nuit${nuits > 1 ? "s" : ""}`;
                })()}
                )
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
            {r.codeChambreMaster ? (
              <Badge
                variant="outline"
                className="gap-1 text-xs font-semibold tracking-wide"
                title="Code de la porte de la chambre master"
              >
                <BedDouble className="h-3 w-3" />
                {r.codeChambreMaster}
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
          accidentelle). La cuisine ne se prépare que pour une arrivée (kind "in") ; le ménage a
          ses deux sections (pendant le séjour + départ) sur les deux cartes, pour toujours voir
          l'ensemble du ménage d'un séjour au même endroit. */}
      <div className="space-y-2 px-3 pb-3">
        {kind === "out" ? (
          // Uniquement le ménage de départ ici : la femme de ménage "pendant le séjour" n'a plus
          // sa place sur une carte de checkout — le client part, ça ne peut plus être sollicité
          // (Kamel, 2026-08-16). Elle reste sur la carte check-in, où elle a du sens.
          <PersonnelAffectationEditor
            reservationId={r.id}
            role="menage"
            moment="depart"
            label="Ménage de départ (prépare l'arrivée suivante) — cliquer sur le nom pour confirmer fait"
            assigned={r.menageDepartAssignes}
            options={r.menageOptions}
            payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
          />
        ) : (
          <>
            <PersonnelAffectationEditor
              reservationId={r.id}
              role="cuisine"
              label="Cuisine"
              assigned={r.cuisineAssignes}
              options={r.cuisineOptions}
              payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
            />
            {/* Distinct du ménage de départ (carte check-out) : ici, une femme de ménage
                sollicitée PENDANT le séjour à la demande du client — souvent une personne
                différente de l'équipe de départ. Kamel, 2026-08-06 : "quand le client arrive il
                veut une femme de ménage donc on la note, et quand il part les femmes de ménage
                préparent l'arrivée du prochain client, et il se peut que ce soit d'autres femmes." */}
            <PersonnelAffectationEditor
              reservationId={r.id}
              role="menage"
              moment="sejour"
              label="Femme de ménage (si besoin pendant le séjour)"
              assigned={r.menageSejourAssignes}
              options={r.menageOptions}
              payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
            />
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Numéro déjà accessible en un clic via l'icône WhatsApp à côté du nom, en haut de la
              carte — plus besoin de le répéter ici en plus (Kamel, 2026-08-16). */}
          <ValidateCheckinCheckoutButton
            reservationId={r.id}
            kind={kind}
            valideAt={kind === "in" ? r.checkinValideAt : r.checkoutValideAt}
            validePar={kind === "in" ? r.checkinValidePar : r.checkoutValidePar}
          />
        </div>
      </div>

      {/* mt-auto : ancre ce bloc en bas de la carte, pour que les deux cartes d'un même
          turnover (check-out à gauche, check-in à droite) se terminent au même niveau malgré un
          contenu différent en quantité (le check-in a 4 barres + badges fiche/contrat, le
          check-out seulement 3 barres) — Kamel, 2026-08-17 : "je veux toujours que tout soit
          symétrique". */}
      <div className="mt-auto space-y-3 border-t px-3 pb-3 pt-3">
          {/* Fiche police, contrat et messages d'arrivée/sécurité concernent l'arrivée d'un
              client, pas son départ — inutile et trompeur de les montrer sur une carte de
              checkout (le message sécurité dit littéralement "nouveau client à venir"). */}
          {isProprietaire || kind !== "in" ? null : (
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
              reservationId={r.id}
              loyerTotal={r.loyerTotal}
              montantPaye={r.montantPaye}
              caution={r.caution}
              cautionPayee={r.cautionPayee}
              devisePaiement={r.devisePaiement}
            />
          )}

          {/* Mêmes actions "qui concluent une étape" que sur la carte checkout : boutons noirs
              pleine largeur, un par ligne (Kamel, 2026-08-16 : "tu l'as fais pour checkout mais
              pas checkin donc fais le"). */}
          {kind === "in" ? (
            <div className="flex flex-col gap-1.5">
              {r.guestPhone && r.villaId ? (
                <ArrivalMessageButton
                  prominent
                  reservationId={r.id}
                  villaId={r.villaId}
                  phone={r.guestPhone}
                  guestName={r.guestName}
                  checkIn={new Date(r.checkIn)}
                  now={nowInMorocco()}
                  ficheId={r.ficheId}
                  ficheComplete={r.ficheStatut === "complete"}
                  repasInclus={r.repasInclusDansLoyer}
                />
              ) : null}
              {r.guestPhone && r.villaNom ? (
                <WelcomeMessageButton
                  prominent
                  phone={r.guestPhone}
                  guestName={r.guestName}
                  villaNom={r.villaNom}
                  mapsUrl={r.domaineMapsUrl}
                  wazeUrl={r.domaineWazeUrl}
                  codeBoitier={r.codeBoitier}
                  guideBienvenueUrl={r.guideBienvenueUrl}
                  repasInclus={r.repasInclusDansLoyer}
                />
              ) : null}
              {r.guestPhone && r.domaineMapsUrl ? (
                <LocationMessageButton
                  prominent
                  phone={r.guestPhone}
                  guestName={r.guestName}
                  domaineNom={r.domaineNom ?? "domaine"}
                  mapsUrl={r.domaineMapsUrl}
                  wazeUrl={r.domaineWazeUrl}
                />
              ) : null}
              {r.villaId && r.domaineSecuritePhone ? (
                <SecurityMessageButton
                  prominent
                  securityPhone={r.domaineSecuritePhone}
                  guestName={r.guestName}
                  villaNom={r.villaNom ?? "Villa"}
                  villaNumero={r.villaNumero ?? "?"}
                  villaId={r.villaId}
                  checkIn={new Date(r.checkIn)}
                />
              ) : null}
            </div>
          ) : null}

          {/* Ces trois actions concluent le séjour (procédure de départ, message de remerciement,
              note client) — mises en avant en noir plein, une par ligne, plutôt que noyées dans
              une rangée de boutons outline comme le reste (Kamel, 2026-08-16). */}
          {kind === "out" && !isProprietaire ? (
            <div className="flex flex-col gap-1.5">
              {r.guestPhone && r.villaNom ? (
                <CheckoutMessageButton prominent phone={r.guestPhone} guestName={r.guestName} villaNom={r.villaNom} />
              ) : null}
              {r.guestPhone ? <DepartureMessageButton prominent phone={r.guestPhone} guestName={r.guestName} /> : null}
              <StayRatingButton prominent reservationId={r.id} />
            </div>
          ) : null}

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
