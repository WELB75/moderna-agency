"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DisponibiliteCalendar } from "@/components/app/disponibilite-calendar";
import {
  annulerSejourProprietaire,
  indisponibilitesProprietaire,
  reserverDatesProprietaire,
} from "@/lib/actions/calendrier-proprietaire";

export type SejourProprietaire = { id: string; nom: string; arrivee: string; depart: string };

function dateLongue(jour: string): string {
  return format(parseISO(jour), "EEE d MMM yyyy", { locale: fr });
}

// Bloc "Réserver mes dates" du lien public calendrier (/cal/[token]) : le propriétaire choisit
// ses dates dans le même calendrier de disponibilité que l'assistant de l'équipe, et peut annuler
// ses séjours à venir. Toute la vérification (jeton, dates libres, logement) est refaite côté
// serveur, voir lib/actions/calendrier-proprietaire.ts.
export function ProprietaireReservation({
  token,
  nomParDefaut,
  sejours,
}: {
  token: string;
  nomParDefaut: string;
  sejours: SejourProprietaire[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [indispos, setIndispos] = useState<{ nuits: string[]; tempsReel: boolean } | null>(null);
  const [arrivee, setArrivee] = useState("");
  const [depart, setDepart] = useState("");
  const [nom, setNom] = useState(nomParDefaut);
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const [annulationEnCours, startAnnulation] = useTransition();

  const nuitsPrises = useMemo(() => new Set(indispos?.nuits ?? []), [indispos]);

  // Disponibilités relues à chaque ouverture (Beds24 en direct), jamais gardées d'une fois à l'autre.
  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    indisponibilitesProprietaire(token)
      .then((res) => {
        if (!annule) setIndispos(res ?? { nuits: [], tempsReel: false });
      })
      .catch(() => {
        if (!annule) setIndispos({ nuits: [], tempsReel: false });
      });
    return () => {
      annule = true;
    };
  }, [ouvert, token]);

  function ouvrir(valeur: boolean) {
    setOuvert(valeur);
    if (valeur) {
      setIndispos(null);
      setArrivee("");
      setDepart("");
      setNote("");
      setErreur(null);
    }
  }

  function reserver() {
    if (!arrivee || !depart) {
      setErreur("Choisissez une date d'arrivée puis une date de départ dans le calendrier.");
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const res = await reserverDatesProprietaire(token, { arrivee, depart, nom, note }).catch(() => null);
      if (!res) {
        setErreur("Connexion impossible. Réessayez dans un instant.");
        return;
      }
      if (!res.ok) {
        setErreur(res.erreur);
        return;
      }
      toast.success(res.message);
      setOuvert(false);
      router.refresh();
    });
  }

  function annuler(id: string) {
    startAnnulation(async () => {
      const res = await annulerSejourProprietaire(token, id).catch(() => null);
      if (!res) {
        toast.error("Connexion impossible. Réessayez dans un instant.");
        return;
      }
      if (!res.ok) {
        toast.error(res.erreur);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Vous souhaitez profiter de votre villa ?</p>
            <p className="text-sm text-muted-foreground">
              Réservez vos dates : elles sont aussitôt fermées sur Airbnb et Booking.com.
            </p>
          </div>
          <Button onClick={() => ouvrir(true)} className="h-11 sm:h-9">
            <CalendarDays className="h-4 w-4" />
            Réserver mes dates
          </Button>
        </div>

        {sejours.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Vos séjours à venir</p>
            <ul className="space-y-1.5">
              {sejours.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{s.nom}</span>
                    <span className="text-muted-foreground"> · du {dateLongue(s.arrivee)} au {dateLongue(s.depart)}</span>
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={annulationEnCours}
                        className="shrink-0 text-destructive hover:text-destructive max-md:h-10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Annuler
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Annuler ce séjour ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Du {dateLongue(s.arrivee)} au {dateLongue(s.depart)}. Les dates redeviennent disponibles à la
                          location sur Airbnb et Booking.com.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Garder le séjour</AlertDialogCancel>
                        <AlertDialogAction onClick={() => annuler(s.id)}>Annuler le séjour</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={ouvert} onOpenChange={ouvrir}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Réserver mes dates</DialogTitle>
            <DialogDescription>
              Touchez votre jour d&apos;arrivée puis votre jour de départ. Les nuits barrées sont déjà prises.
            </DialogDescription>
          </DialogHeader>

          {!indispos ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lecture des disponibilités…
            </p>
          ) : (
            <div className="space-y-4">
              <DisponibiliteCalendar
                nuitsPrises={nuitsPrises}
                arrivee={arrivee}
                depart={depart}
                onChange={(a, d) => {
                  setArrivee(a);
                  setDepart(d);
                  setErreur(null);
                }}
              />
              <div className="space-y-1.5">
                <Label htmlFor="sejour-nom">Au nom de</Label>
                <Input id="sejour-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={80} className="h-11 md:h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sejour-note">Message pour l&apos;agence (facultatif)</Label>
                <Textarea
                  id="sejour-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Ex. arrivée vers 18h, ménage à prévoir…"
                />
              </div>
              {erreur ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erreur}</p> : null}
              <Button onClick={reserver} disabled={enCours || !arrivee || !depart} className="h-11 w-full">
                {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmer la réservation
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
