import Link from "next/link";
import { format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Baby,
  BedDouble,
  BrushCleaning,
  ChefHat,
  ChevronDown,
  CircleCheck,
  DoorClosedLocked,
  FileText,
  Info,
  KeyRound,
  LogIn,
  LogOut,
  ScrollText,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/app/countdown";
import { ArrivalMessageButton } from "@/components/app/arrival-message-button";
import { WelcomeMessageButton } from "@/components/app/welcome-message-button";
import { LocationMessageButton } from "@/components/app/location-message-button";
import { SecurityMessageButton } from "@/components/app/security-message-button";
import { CuisineCoursesMessageButton } from "@/components/app/cuisine-courses-message-button";
import { CheckoutMessageButton } from "@/components/app/checkout-message-button";
import { DepartureMessageButton } from "@/components/app/departure-message-button";
import { StayRatingButton } from "@/components/app/stay-rating-button";
import { EditReservationTimeDialog } from "@/components/app/edit-reservation-time-dialog";
import { ValidateCheckinCheckoutButton } from "@/components/app/validate-checkin-checkout-button";
import { FichePoliceStatusChip } from "@/components/app/fiche-police-status-chip";
import { ContratStatusChip } from "@/components/app/contrat-status-chip";
import { PaymentSummary } from "@/components/app/payment-info";
import { PersonnelAffectationEditor } from "@/components/app/personnel-affectation-editor";
import { GuestWhatsAppButton } from "@/components/app/guest-whatsapp-button";
import { EditGuestPhoneButton } from "@/components/app/edit-guest-phone-button";
import { EditNotesButton } from "@/components/app/edit-notes-button";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { CanalDot } from "@/components/app/canal-badge";
import { SectionLabel } from "@/components/app/dashboard-ui";
import {
  InlineAlert,
  LienPlateforme,
  RecapInline,
  VillaVignette,
  descriptionSuppression,
  type ReservationRow,
} from "@/components/app/reservation-row-card";
import { deleteReservation } from "@/lib/actions/reservations";
import { nowInMorocco, formatUtcTime } from "@/lib/now";
import { normaliseCanal } from "@/lib/canal";
import { phonesMatch } from "@/lib/phone";
import { cn } from "@/lib/utils";

// Carte d'agenda du tableau de bord (2026-10-21, refonte épurée) : une ligne de résumé toujours
// visible — heure, sens (arrivée/départ), logement, client, état des points clés — et, en
// dessous, le détail complet replié dans un <details> : équipe ménage/cuisine, validation,
// documents, paiement, messages, correction d'heure, suppression. Exactement les mêmes
// fonctionnalités que l'ancienne vue horizontale (Kamel, 2026-10-13 : "une vue horizontale mais
// avec toutes ces fonctionnalités"), mais rien n'est déplié d'office sauf ce qui reste à traiter
// aujourd'hui : on voit la semaine d'un coup d'œil et on ouvre la carte sur laquelle on
// travaille.
//
// Comme sur la carte verticale, les boutons interactifs sont hors de tout <Link> ; dans la ligne
// de résumé (qui est le <summary>), les seuls éléments cliquables sont le lien vers la fiche
// logement et l'icône WhatsApp, qui bloquent eux-mêmes la propagation pour ne pas replier la
// carte.
export function ReservationAgendaCard({
  r,
  kind,
  defaultOpen = false,
}: {
  r: ReservationRow;
  kind: "in" | "out";
  defaultOpen?: boolean;
}) {
  const isIn = kind === "in";
  const target = isIn ? new Date(r.checkIn) : new Date(r.checkOut);
  const isProprietaire = phonesMatch(r.guestPhone, r.proprietaireTelephone);
  const valideAt = isIn ? r.checkinValideAt : r.checkoutValideAt;
  const validePar = isIn ? r.checkinValidePar : r.checkoutValidePar;
  const isDone = Boolean(valideAt);
  const isBloque = Boolean(r.canal && normaliseCanal(r.canal) === "bloque");
  const nuits = Math.max(0, differenceInCalendarDays(new Date(r.checkOut), new Date(r.checkIn)));

  const statuts = resumeStatuts(r, kind, isProprietaire);

  return (
    <details
      open={defaultOpen || undefined}
      className={cn(
        "group rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,26,23,0.04)] transition-opacity",
        isDone && "opacity-70 open:opacity-100"
      )}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 marker:content-none select-none sm:items-center sm:px-4 [&::-webkit-details-marker]:hidden">
        {/* Heure + sens */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-0.5 sm:pt-0">
          <span className="text-base font-semibold tabular-nums leading-none">{format(target, "HH:mm")}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isBloque
                ? "bg-yellow-400/15 text-yellow-700 dark:text-yellow-400"
                : isIn
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-700 dark:text-red-400"
            )}
          >
            {isIn ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
            {isIn ? "In" : "Out"}
          </span>
        </div>

        {/* Logement (la fiche s'ouvre depuis le détail, pas depuis le résumé : sur téléphone, on
            tape naturellement sur la photo pour déplier la carte, pas pour changer de page) */}
        <span className="shrink-0 self-center">
          <VillaVignette photoUrl={r.villaPhotoUrl} numero={r.villaNumero} nom={r.villaNom} type={r.villaType} size="md" />
        </span>

        {/* Texte principal */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{r.villaNom ?? "Logement non renseigné"}</span>
            {r.villaType === "appartement" && r.numeroImmeuble ? (
              <span className="shrink-0 text-xs text-muted-foreground">· imm. {r.numeroImmeuble}</span>
            ) : null}
            {isProprietaire ? (
              <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
                Propriétaire
              </Badge>
            ) : null}
            {r.aRelancer ? (
              <Badge variant="destructive" className="h-4 shrink-0 px-1.5 text-[10px]">
                À relancer
              </Badge>
            ) : null}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {r.canal ? <CanalDot canal={r.canal} size="xs" /> : null}
            <span className="truncate text-foreground">{r.guestName}</span>
            {r.guestPhone ? <GuestWhatsAppButton phone={r.guestPhone} guestName={r.guestName} /> : null}
            {r.nbAdultes !== null || r.nbEnfants !== null ? (
              <span className="hidden shrink-0 items-center gap-2 text-xs sm:inline-flex">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {r.nbAdultes ?? 0}
                </span>
                {r.nbEnfants ? (
                  <span className="inline-flex items-center gap-1">
                    <Baby className="h-3 w-3" />
                    {r.nbEnfants}
                  </span>
                ) : null}
              </span>
            ) : null}
            {isIn && nuits > 0 ? <span className="hidden shrink-0 text-xs sm:inline">· {nuits} nuit{nuits > 1 ? "s" : ""}</span> : null}
          </p>
          {statuts.length > 0 || r.notes ? (
            <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {statuts.map((s) => (
                <StatutMini key={s.label} {...s} />
              ))}
              {r.notes ? (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-amber-700 dark:text-amber-400">
                  <Info className="h-3 w-3 shrink-0" />
                  <span className="truncate">{r.notes}</span>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* État / compte à rebours + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 self-center sm:flex-row sm:items-center sm:gap-2">
          {isDone && valideAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="h-3.5 w-3.5" />
              Fait · {formatUtcTime(valideAt)}
            </span>
          ) : (
            <Countdown target={target} className="rounded-full" />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </div>
      </summary>

      {/* ---- Détail ---- */}
      <div className="space-y-5 border-t border-border px-4 pb-4 pt-4">
        {/* Repères : contact, plateforme, codes, voyageurs, alertes */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {r.villaId ? (
              <Link href={`/villas/${r.villaId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                {r.villaNom ?? "Fiche du logement"}
                {r.villaNumero ? <span className="font-normal text-muted-foreground"> · n°{r.villaNumero}</span> : null}
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1 font-medium">
              {r.guestName}
              {r.guestPhone ? <GuestWhatsAppButton phone={r.guestPhone} guestName={r.guestName} /> : null}
              <EditGuestPhoneButton reservationId={r.id} guestPhone={r.guestPhone} />
              <EditNotesButton reservationId={r.id} notes={r.notes} />
            </span>
            {r.nbAdultes !== null || r.nbEnfants !== null ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {r.nbAdultes ?? 0} adulte{(r.nbAdultes ?? 0) > 1 ? "s" : ""}
                </span>
                {r.nbEnfants ? (
                  <span className="inline-flex items-center gap-1">
                    <Baby className="h-3.5 w-3.5" />
                    {r.nbEnfants} enfant{r.nbEnfants > 1 ? "s" : ""}
                  </span>
                ) : null}
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {isIn ? (
                <>
                  Du {format(new Date(r.checkIn), "d MMM HH:mm", { locale: fr })} au {format(new Date(r.checkOut), "d MMM HH:mm", { locale: fr })}
                  {nuits > 0 ? ` · ${nuits} nuit${nuits > 1 ? "s" : ""}` : ""}
                </>
              ) : (
                <>Arrivé le {format(new Date(r.checkIn), "d MMM", { locale: fr })} · départ {format(target, "d MMM 'à' HH:mm", { locale: fr })}</>
              )}
            </span>
            {r.lienPlateforme ? <LienPlateforme lien={r.lienPlateforme} /> : null}
          </div>

          {r.codeBoitier || r.codePorteEntree || r.codeChambreMaster ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {r.codeBoitier ? <CodeBadge icon={KeyRound} title="Code du boîtier à clés" value={r.codeBoitier} /> : null}
              {r.codePorteEntree ? (
                <CodeBadge icon={DoorClosedLocked} title="Code de la poignée tactile de la porte d'entrée" value={r.codePorteEntree} />
              ) : null}
              {r.codeChambreMaster ? <CodeBadge icon={BedDouble} title="Code de la porte de la chambre master" value={r.codeChambreMaster} /> : null}
            </div>
          ) : null}

          {(isIn && r.clientConnu) || (!isIn && r.cashAPrevoir > 0) || r.notes || r.recap ? (
            <div className="space-y-1.5">
              {isIn && r.clientConnu ? (
                <InlineAlert tone="blue" icon={UserCheck}>
                  Client connu ({r.clientConnu.nom}){r.clientConnu.notes ? ` — ${r.clientConnu.notes}` : ""}
                </InlineAlert>
              ) : null}
              {!isIn && r.cashAPrevoir > 0 ? (
                <InlineAlert tone="amber" icon={Wallet}>
                  Cash à prévoir : {r.cashAPrevoir} MAD
                </InlineAlert>
              ) : null}
              {r.notes ? (
                <InlineAlert tone="amber" icon={Info}>
                  {r.notes}
                </InlineAlert>
              ) : null}
              {r.recap ? <RecapInline recap={r.recap} /> : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
          {/* Équipe + validation */}
          <div className="space-y-3">
            <SectionLabel>Équipe</SectionLabel>
            {!isIn ? (
              // Uniquement le ménage de départ sur un départ : la femme de ménage "pendant le
              // séjour" n'a plus sa place une fois le client parti (Kamel, 2026-08-16).
              <PersonnelAffectationEditor
                reservationId={r.id}
                role="menage"
                moment="depart"
                label="Ménage de départ · cliquer sur un nom pour confirmer fait"
                assigned={r.menageDepartAssignes}
                options={r.menageOptions}
                payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
                villaTarifContext={{ domaineNom: r.domaineNom, nbChambres: r.villaNbChambres }}
                brahimPrevenuAt={r.brahimPrevenuAt}
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
                {/* Le message "courses" n'a de sens qu'une fois une cuisinière affectée. */}
                {r.cuisineAssignes.length > 0 && r.guestPhone ? (
                  <CuisineCoursesMessageButton
                    reservationId={r.id}
                    phone={r.guestPhone}
                    guestName={r.guestName}
                    envoyeAt={r.messageCuisineEnvoyeAt}
                  />
                ) : null}
                {/* Distinct du ménage de départ : une femme de ménage sollicitée PENDANT le
                    séjour à la demande du client (Kamel, 2026-08-06). */}
                <PersonnelAffectationEditor
                  reservationId={r.id}
                  role="menage"
                  moment="sejour"
                  label="Ménage pendant le séjour (si demandé par le client)"
                  assigned={r.menageSejourAssignes}
                  options={r.menageOptions}
                  payeParProprietaireNoms={r.personnelPayeParProprietaireNoms}
                  villaTarifContext={{ domaineNom: r.domaineNom, nbChambres: r.villaNbChambres }}
                />
              </>
            )}
            <div className="pt-1">
              <ValidateCheckinCheckoutButton reservationId={r.id} kind={kind} valideAt={valideAt} validePar={validePar} />
            </div>
          </div>

          {/* Documents + paiement (un départ n'a ni fiche police ni contrat à montrer) */}
          {isProprietaire ? null : (
            <div className="space-y-3">
              <SectionLabel>{isIn ? "Documents et paiement" : "Paiement"}</SectionLabel>
              {isIn ? (
                <div className="flex flex-wrap gap-1.5">
                  <FichePoliceStatusChip reservationId={r.id} villaId={r.villaId} ficheId={r.ficheId} ficheStatut={r.ficheStatut} />
                  <ContratStatusChip contratId={r.contratId} contratStatut={r.contratStatut} villaId={r.villaId} reservationId={r.id} />
                </div>
              ) : null}
              <PaymentSummary
                reservationId={r.id}
                loyerTotal={r.loyerTotal}
                montantPaye={r.montantPaye}
                caution={r.caution}
                cautionPayee={r.cautionPayee}
                devisePaiement={r.devisePaiement}
              />
              {r.loyerTotal === null && !isIn ? <p className="text-sm text-muted-foreground">Aucun montant renseigné.</p> : null}
            </div>
          )}
        </div>

        {/* Messages + outils */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {isIn ? (
              <>
                {r.villaId ? (
                  <ArrivalMessageButton
                    reservationId={r.id}
                    villaId={r.villaId}
                    phone={r.guestPhone}
                    guestName={r.guestName}
                    checkIn={new Date(r.checkIn)}
                    now={nowInMorocco()}
                    ficheId={r.ficheId}
                    ficheComplete={r.ficheStatut === "complete"}
                    repasInclus={r.repasInclusDansLoyer}
                    envoyeAt={r.messageArriveeEnvoyeAt}
                  />
                ) : null}
                {r.villaNom ? (
                  <WelcomeMessageButton
                    reservationId={r.id}
                    phone={r.guestPhone}
                    guestName={r.guestName}
                    villaNom={r.villaNom}
                    mapsUrl={r.domaineMapsUrl}
                    wazeUrl={r.domaineWazeUrl}
                    codeBoitier={r.codeBoitier}
                    guideBienvenueUrl={r.guideBienvenueUrl}
                    repasInclus={r.repasInclusDansLoyer}
                    envoyeAt={r.messageBienvenueEnvoyeAt}
                  />
                ) : null}
                {r.guestPhone && r.domaineMapsUrl ? (
                  <LocationMessageButton
                    reservationId={r.id}
                    phone={r.guestPhone}
                    guestName={r.guestName}
                    domaineNom={r.domaineNom ?? "domaine"}
                    mapsUrl={r.domaineMapsUrl}
                    wazeUrl={r.domaineWazeUrl}
                    envoyeAt={r.messageLocalisationEnvoyeAt}
                  />
                ) : null}
                {r.villaId && r.domaineSecuritePhone ? (
                  <SecurityMessageButton
                    securityPhone={r.domaineSecuritePhone}
                    guestName={r.guestName}
                    villaNom={r.villaNom ?? "Villa"}
                    villaNumero={r.villaNumero ?? "?"}
                    reservationId={r.id}
                    checkIn={new Date(r.checkIn)}
                    envoyeAt={r.messageSecuriteEnvoyeAt}
                  />
                ) : null}
              </>
            ) : !isProprietaire ? (
              <>
                {r.guestPhone && r.villaNom ? (
                  <CheckoutMessageButton phone={r.guestPhone} guestName={r.guestName} villaNom={r.villaNom} />
                ) : null}
                {r.guestPhone ? <DepartureMessageButton phone={r.guestPhone} guestName={r.guestName} /> : null}
                <StayRatingButton reservationId={r.id} />
              </>
            ) : null}

            <div className="ml-auto flex items-center gap-1">
              <EditReservationTimeDialog reservationId={r.id} checkIn={new Date(r.checkIn)} checkOut={new Date(r.checkOut)} />
              <ConfirmDeleteButton
                action={deleteReservation.bind(null, r.id)}
                title="Supprimer cette réservation ?"
                description={descriptionSuppression(r)}
              />
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

type StatutMiniProps = { label: string; tone: "ok" | "attente" | "urgent" | "neutre"; icon: LucideIcon };

// Points clés affichés dans la ligne de résumé, sans ouvrir la carte : ce qui conditionne
// l'arrivée (fiche police, contrat, cuisine prévue) ou le départ (ménage, cash à apporter).
function resumeStatuts(r: ReservationRow, kind: "in" | "out", isProprietaire: boolean): StatutMiniProps[] {
  const out: StatutMiniProps[] = [];
  if (kind === "in") {
    if (!isProprietaire) {
      out.push({
        icon: FileText,
        label: r.ficheStatut === "complete" ? "Fiche police faite" : "Fiche police",
        tone: r.ficheStatut === "complete" ? "ok" : "attente",
      });
      out.push({
        icon: ScrollText,
        label: r.contratStatut === "signe" ? "Contrat signé" : "Contrat",
        tone: r.contratStatut === "signe" ? "ok" : "attente",
      });
    }
    if (r.cuisineAssignes.length > 0) {
      out.push({ icon: ChefHat, label: `Cuisine : ${r.cuisineAssignes.map((a) => a.nom.split(" ")[0]).join(", ")}`, tone: "ok" });
    }
  } else {
    const assignes = r.menageDepartAssignes;
    if (assignes.length === 0) {
      out.push({ icon: BrushCleaning, label: "Ménage non assigné", tone: "urgent" });
    } else if (assignes.every((a) => a.faitAt)) {
      out.push({ icon: BrushCleaning, label: "Ménage fait", tone: "ok" });
    } else {
      out.push({ icon: BrushCleaning, label: `Ménage : ${assignes.map((a) => a.nom.split(" ")[0]).join(", ")}`, tone: "attente" });
    }
    if (r.cashAPrevoir > 0) {
      out.push({ icon: Wallet, label: `${r.cashAPrevoir} MAD à prévoir`, tone: "attente" });
    }
  }
  return out;
}

function StatutMini({ label, tone, icon: Icon }: StatutMiniProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        tone === "ok" && "text-emerald-700 dark:text-emerald-400",
        tone === "attente" && "text-amber-700 dark:text-amber-400",
        tone === "urgent" && "font-medium text-red-600 dark:text-red-400"
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}

function CodeBadge({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <Badge variant="outline" className="gap-1 text-xs font-semibold tracking-wide" title={title}>
      <Icon className="h-3 w-3" />
      {value}
    </Badge>
  );
}
