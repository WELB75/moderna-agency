"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Plus, ScanLine, Share2, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SignaturePad, type SignaturePadHandle } from "@/components/app/signature-pad";
import { IdPhotoCapture } from "@/components/app/id-photo-capture";
import { ConditionsAcceptation } from "@/components/app/conditions-acceptation";
import type { OccupantInput } from "@/lib/actions/gendarmerie";
import { analyzePassportImagePublic } from "@/lib/actions/gendarmerie-import";
import {
  ajouterPhotosEnfantsPublic,
  enregistrerOccupantPublic,
  fixerNombreAdultesPublic,
  type EtatFiche,
} from "@/lib/actions/gendarmerie-progressif";
import { ACCEPTATION_TEXTE, type ConditionsSejourData } from "@/lib/conditions-sejour";
import {
  FIELD_KEYS,
  FIELD_LABELS,
  LANG_LABELS,
  UI_TEXT,
  DATE_FIELD_KEYS,
  emptyOccupant,
  translateOcrWarning,
  type GendarmerieLang,
} from "@/lib/gendarmerie-i18n";
import { PROGRESSIF_TEXT } from "@/lib/gendarmerie-progressif-i18n";
import { cn } from "@/lib/utils";

// Fiche police « voyageur par voyageur » (/g/[id]) — Fouad, 2026-10-31. Voir
// lib/actions/gendarmerie-progressif.ts pour la règle. Ici :
// - en-tête de progression « 2 adultes sur 4 enregistrés » + prénoms déjà reçus ;
// - UNE carte (« Ma fiche ») : scan du passeport, champs, photo de la pièce, signature ; le
//   premier qui s'enregistre accepte aussi les conditions de séjour (= contrat) ;
// - après l'enregistrement : merci, ce qu'il manque, bouton de partage WhatsApp / copie du lien,
//   « ajouter une autre personne depuis ce téléphone », photos des enfants, correction du nombre
//   d'adultes ;
// - brouillon : la carte en cours est sauvegardée dans le navigateur (localStorage) à chaque
//   frappe, pour ne rien perdre si la page se ferme avant la signature (la signature, elle, se
//   redessine en deux secondes).

const OCR_FIELDS = [
  "nom",
  "prenom",
  "dateNaissance",
  "nationalite",
  "venantDe",
  "typePiece",
  "numeroPiece",
  "lieuNaissance",
  "datePiece",
  "lieuPiece",
  "photoPieceUrl",
] as const satisfies readonly (keyof OccupantInput)[];

const LANG_STORAGE = (formId: string) => `fiche-police:${formId}:langue`;
const DRAFT_STORAGE = (formId: string) => `fiche-police:${formId}:brouillon`;
// Au-delà, on ne garde pas la photo dans le brouillon (quota localStorage ~5 Mo).
const DRAFT_PHOTO_MAX = 1_500_000;

function lireStockage(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}
function ecrireStockage(cle: string, valeur: string | null) {
  try {
    if (valeur === null) window.localStorage.removeItem(cle);
    else window.localStorage.setItem(cle, valeur);
  } catch {
    // quota dépassé ou navigation privée : le brouillon est un confort, pas une obligation
  }
}

export function GendarmerieFormProgressif({
  formId,
  villaNom,
  etatInitial,
  nbEnfants = 0,
  conditions = null,
  langueInitiale = null,
}: {
  formId: string;
  villaNom: string;
  etatInitial: EtatFiche;
  nbEnfants?: number;
  conditions?: ConditionsSejourData | null;
  langueInitiale?: string | null;
}) {
  const [lang, setLang] = useState<GendarmerieLang | null>(null);
  const [etat, setEtat] = useState<EtatFiche>(etatInitial);
  const [attendusSaisi, setAttendusSaisi] = useState<string>(etatInitial.attendus ? String(etatInitial.attendus) : "");
  const [occupant, setOccupant] = useState<OccupantInput>(() => emptyOccupant());
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null); // prénom de la fiche qu'on vient d'enregistrer
  const [enfantsPhotos, setEnfantsPhotos] = useState<string[]>(() => Array.from({ length: Math.max(0, nbEnfants - etatInitial.enfantsPhotos) }, () => ""));
  const [isPending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [copie, setCopie] = useState(false);
  const sigRef = useRef<SignaturePadHandle | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const brouillonRestaure = useRef(false);

  // Langue : mémorisée dans le navigateur pour que le lien rouvert ne redemande pas. Lecture
  // après l'hydratation (localStorage n'existe pas côté serveur), hors du corps de l'effet.
  useEffect(() => {
    const id = setTimeout(() => {
      const memo = lireStockage(LANG_STORAGE(formId)) ?? langueInitiale;
      if (memo && memo in LANG_LABELS) setLang(memo as GendarmerieLang);
    }, 0);
    return () => clearTimeout(id);
  }, [formId, langueInitiale]);

  // Brouillon de la carte en cours (restauré une seule fois, quand la langue est connue).
  useEffect(() => {
    if (!lang || brouillonRestaure.current) return;
    brouillonRestaure.current = true;
    const id = setTimeout(() => {
      const brut = lireStockage(DRAFT_STORAGE(formId));
      if (!brut) return;
      try {
        const draft = JSON.parse(brut) as Partial<OccupantInput>;
        const rempli = Object.values(draft).some((v) => typeof v === "string" && v.trim());
        if (rempli) {
          setOccupant({ ...emptyOccupant(), ...draft, signatureImage: "" });
          toast.info(PROGRESSIF_TEXT[lang].draftRestored);
        }
      } catch {
        // brouillon illisible : on repart de zéro
      }
    }, 0);
    return () => clearTimeout(id);
  }, [formId, lang]);

  useEffect(() => {
    if (!lang) return;
    const rempli = FIELD_KEYS.some((k) => occupant[k]?.trim()) || Boolean(occupant.photoPieceUrl);
    if (!rempli) {
      ecrireStockage(DRAFT_STORAGE(formId), null);
      return;
    }
    const { signatureImage: _s, ...sans } = occupant;
    void _s;
    const draft = { ...sans, photoPieceUrl: sans.photoPieceUrl.length <= DRAFT_PHOTO_MAX ? sans.photoPieceUrl : "" };
    ecrireStockage(DRAFT_STORAGE(formId), JSON.stringify(draft));
  }, [formId, lang, occupant]);

  function choisirLangue(l: GendarmerieLang) {
    setLang(l);
    ecrireStockage(LANG_STORAGE(formId), l);
  }

  async function scanner(file: File) {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await analyzePassportImagePublic(formId, formData);
      setOccupant((prev) => {
        const merged = { ...prev };
        for (const key of OCR_FIELDS) {
          if (result.occupant[key]) merged[key] = result.occupant[key];
        }
        return merged;
      });
      if (result.warnings.length > 0) result.warnings.forEach((w) => toast.warning(translateOcrWarning(w, lang!)));
      else toast.success(UI_TEXT[lang!].scanSuccess);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur / Error");
    } finally {
      setScanning(false);
    }
  }

  if (!lang) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-1 py-8 text-center md:py-12">
        <p className="text-lg font-medium">Choose your language / Choisissez votre langue / Kies uw taal / اختر لغتك</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(LANG_LABELS) as GendarmerieLang[]).map((l) => (
            <Button key={l} variant="outline" className="h-12 text-base md:h-8 md:text-sm" onClick={() => choisirLangue(l)}>
              {LANG_LABELS[l]}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const t = UI_TEXT[lang];
  const p = PROGRESSIF_TEXT[lang];
  const labels = FIELD_LABELS[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const complete = etat.statut === "complete";
  const manquants = etat.attendus ? Math.max(0, etat.attendus - etat.recus) : null;
  // Les conditions ne sont proposées qu'au premier qui s'enregistre (le serveur ignore ensuite).
  const proposerConditions = Boolean(conditions) && etat.recus === 0;

  function majOccupant(key: keyof OccupantInput, value: string) {
    setOccupant((prev) => ({ ...prev, [key]: value }));
  }

  function enregistrer() {
    if (!occupant.nom.trim() && !occupant.prenom.trim()) {
      toast.error(p.nameRequired);
      return;
    }
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error(p.signatureRequired);
      return;
    }
    if (proposerConditions && !accepteConditions) {
      toast.error(ACCEPTATION_TEXTE[lang!].erreurCase);
      return;
    }
    const nbAttendus = Number(attendusSaisi);
    const data: OccupantInput = { ...occupant, signatureImage: pad.toDataUrl() };
    startTransition(async () => {
      try {
        const nouvelEtat = await enregistrerOccupantPublic(formId, lang!, data, {
          accepteConditions: proposerConditions && accepteConditions,
          nbAdultesAttendus: etat.recus === 0 && nbAttendus > 0 ? nbAttendus : null,
        });
        ecrireStockage(DRAFT_STORAGE(formId), null);
        setEtat(nouvelEtat);
        setEnregistre(occupant.prenom.trim() || occupant.nom.trim());
        setOccupant(emptyOccupant());
        setAccepteConditions(false);
        pad.clear();
        window.scrollTo({ top: 0, behavior: "smooth" });
        // Pas de router.refresh() ici : l'état renvoyé par l'action suffit, et le rechargement du
        // rendu serveur juste après (fonction Vercel à froid, base Neon endormie) laissait le
        // navigateur WhatsApp sur une page blanche — une cliente a cru que « ça beugue », un
        // rafraîchissement manuel remettait tout (Fouad, 2026-10-31). Les autres voyageurs voient
        // le bon compte en ouvrant le lien (revalidatePath côté action).
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur / Error");
      }
    });
  }

  function partager() {
    const n = manquants ?? 1;
    const message = p.shareMessage(villaNom, window.location.href, n);
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text: message }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  async function copierLien() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      toast.success(p.copied);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      toast.error(url);
    }
  }

  function enregistrerEnfants() {
    const urls = enfantsPhotos.filter(Boolean);
    if (urls.length === 0) return;
    startTransition(async () => {
      try {
        const nouvelEtat = await ajouterPhotosEnfantsPublic(formId, urls);
        setEtat(nouvelEtat);
        setEnfantsPhotos([]);
        toast.success(p.childrenSaved);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur / Error");
      }
    });
  }

  function fixerNombre(n: number) {
    startTransition(async () => {
      try {
        const nouvelEtat = await fixerNombreAdultesPublic(formId, n);
        setEtat(nouvelEtat);
        setAttendusSaisi(String(n));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur / Error");
      }
    });
  }

  const enTete = (
    <div className="space-y-3 text-center">
      <h1 className="text-xl font-bold">{p.title}</h1>
      <p className="text-sm text-muted-foreground">{p.subtitle(villaNom)}</p>
      <Progression etat={etat} lang={lang} />
    </div>
  );

  // Écran après enregistrement (ou fiche déjà complète en arrivant) : merci + ce qu'il manque +
  // partage + enfants + ajouter une autre personne.
  if (enregistre !== null || complete) {
    return (
      <div dir={dir} className="mx-auto max-w-2xl space-y-6 py-6">
        {enTete}
        <Card className={cn(complete ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")}>
          <CardContent className="space-y-3 px-4 py-5 text-center">
            <UserCheck className={cn("mx-auto h-8 w-8", complete ? "text-emerald-600" : "text-amber-600")} />
            {enregistre ? <p className="text-lg font-medium">{p.savedTitle(enregistre)}</p> : null}
            {complete ? (
              <p className="font-medium">{enregistre ? p.allDone : p.alreadyDone}</p>
            ) : manquants !== null ? (
              <p className="text-base font-medium">{p.missing(manquants)}</p>
            ) : null}
          </CardContent>
        </Card>

        {!complete ? (
          <div className="space-y-2">
            <Button type="button" className="h-12 w-full text-base" onClick={partager}>
              <Share2 className="h-4 w-4" />
              {p.share}
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={copierLien}>
                {copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {p.copyLink}
              </Button>
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setEnregistre(null)}>
                <Plus className="h-4 w-4" />
                {p.addAnother}
              </Button>
            </div>
          </div>
        ) : null}

        <SectionEnfants
          t={t}
          p={p}
          photos={enfantsPhotos}
          setPhotos={setEnfantsPhotos}
          dejaRecues={etat.enfantsPhotos}
          onSave={enregistrerEnfants}
          pending={isPending}
        />

        <CorrectionNombre etat={etat} p={p} valeur={attendusSaisi} setValeur={setAttendusSaisi} onFixer={fixerNombre} pending={isPending} complete={complete} />
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-2xl space-y-6 py-6">
      {enTete}
      <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{p.explication}</p>

      {etat.recus === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Label htmlFor="nb-adultes" className="flex-1 font-normal">
            {p.howMany}
          </Label>
          <Input
            id="nb-adultes"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            className="h-11 w-20 text-center md:h-8"
            value={attendusSaisi}
            onChange={(e) => setAttendusSaisi(e.target.value)}
            dir="ltr"
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-3 px-3 py-4 sm:px-4">
          <p className="font-medium">{p.myCard}</p>

          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) scanner(file);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" className="h-11 w-full whitespace-normal md:h-8 md:w-auto" disabled={scanning} onClick={() => scanInputRef.current?.click()}>
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.scanning}
                </>
              ) : (
                <>
                  <ScanLine className="h-4 w-4" />
                  {t.scanPassportButton}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">{t.scanHint}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELD_KEYS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label>{labels[key]}</Label>
                <Input
                  className="h-11 md:h-8"
                  type={DATE_FIELD_KEYS.includes(key) ? "date" : "text"}
                  value={occupant[key]}
                  onChange={(e) => majOccupant(key, e.target.value)}
                  dir={DATE_FIELD_KEYS.includes(key) ? "ltr" : dir}
                />
              </div>
            ))}
          </div>
          <IdPhotoCapture value={occupant.photoPieceUrl} onChange={(dataUrl) => majOccupant("photoPieceUrl", dataUrl)} label={t.photoPiece} />
          <SignaturePad ref={sigRef} label={t.signature} clearLabel={t.signatureClear} />
          {proposerConditions ? <p className="text-xs text-muted-foreground">{p.conditionsNote}</p> : null}
        </CardContent>
      </Card>

      {proposerConditions && conditions ? (
        <ConditionsAcceptation data={conditions} lang={lang} accepte={accepteConditions} onAccepteChange={setAccepteConditions} sansAide />
      ) : null}

      <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
        <Button type="button" disabled={isPending} onClick={enregistrer} className="h-12 w-full text-base">
          {isPending ? p.saving : p.save}
        </Button>
      </div>
    </div>
  );
}

function Progression({ etat, lang }: { etat: EtatFiche; lang: GendarmerieLang }) {
  const p = PROGRESSIF_TEXT[lang];
  const complete = etat.statut === "complete";
  const ratio = etat.attendus ? Math.min(1, etat.recus / etat.attendus) : complete ? 1 : 0;
  return (
    <div className="mx-auto max-w-md space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className={cn("font-medium", complete ? "text-emerald-700 dark:text-emerald-400" : "")}>
          {etat.attendus ? p.progress(etat.recus, etat.attendus) : p.progressSansTotal(etat.recus)}
        </span>
        {complete ? <Check className="h-4 w-4 text-emerald-600" /> : null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", complete ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      {etat.prenoms.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {p.registered} {etat.prenoms.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function SectionEnfants({
  t,
  p,
  photos,
  setPhotos,
  dejaRecues,
  onSave,
  pending,
}: {
  t: (typeof UI_TEXT)[GendarmerieLang];
  p: (typeof PROGRESSIF_TEXT)[GendarmerieLang];
  photos: string[];
  setPhotos: (f: (prev: string[]) => string[]) => void;
  dejaRecues: number;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">{t.childrenTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {t.childrenSubtitle}
          {dejaRecues > 0 ? ` (${dejaRecues} ✓)` : ""}
        </p>
      </div>
      {photos.length > 0 ? (
        <Card>
          <CardContent className="space-y-4 py-4">
            {photos.map((photo, index) => (
              <div key={index} className="flex flex-wrap items-center justify-between gap-2">
                <IdPhotoCapture value={photo} onChange={(dataUrl) => setPhotos((prev) => prev.map((x, i) => (i === index ? dataUrl : x)))} label={t.childPhotoLabel(dejaRecues + index + 1)} />
                <Button type="button" variant="ghost" size="sm" className="h-10 md:h-7" onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}>
                  <X className="h-3.5 w-3.5" />
                  {t.removeOccupant}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" className="h-11 md:h-8" onClick={() => setPhotos((prev) => [...prev, ""])}>
          <Plus className="h-4 w-4" />
          {t.addChild}
        </Button>
        {photos.some(Boolean) ? (
          <Button type="button" className="h-11 md:h-8" disabled={pending} onClick={onSave}>
            {p.childrenSave}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CorrectionNombre({
  etat,
  p,
  valeur,
  setValeur,
  onFixer,
  pending,
  complete,
}: {
  etat: EtatFiche;
  p: (typeof PROGRESSIF_TEXT)[GendarmerieLang];
  valeur: string;
  setValeur: (v: string) => void;
  onFixer: (n: number) => void;
  pending: boolean;
  complete: boolean;
}) {
  const n = Number(valeur);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm">
      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{complete ? p.onePerson : p.adjustCount}</span>
      {complete ? (
        <Button type="button" variant="outline" size="sm" className="h-9 md:h-7" disabled={pending} onClick={() => onFixer((etat.attendus ?? etat.recus) + 1)}>
          <Plus className="h-3.5 w-3.5" />
          {p.adjustValidate}
        </Button>
      ) : (
        <>
          <Input type="number" inputMode="numeric" min={1} max={30} className="h-9 w-16 text-center md:h-7" value={valeur} onChange={(e) => setValeur(e.target.value)} dir="ltr" />
          <Button type="button" variant="outline" size="sm" className="h-9 md:h-7" disabled={pending || !(n > 0) || n === etat.attendus} onClick={() => onFixer(n)}>
            {p.adjustValidate}
          </Button>
        </>
      )}
    </div>
  );
}
