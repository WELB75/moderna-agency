"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Minus, Plus } from "lucide-react";
import { envoyerDemandesServices } from "@/lib/actions/services-voyageur";
import { CREDITS_PHOTOS } from "@/lib/services-photos-credits";
import {
  CATEGORIES_SERVICES,
  CRENEAUX,
  DESCRIPTIONS,
  HEURE_FLEXIBLE,
  SERVICES,
  SERVICE_PAR_CLE,
  TARIFS,
  eurDepuisMad,
  montantEstime,
  type CategorieService,
} from "@/lib/services-catalogue";
import { cn } from "@/lib/utils";

type Langue = "fr" | "en";
type Statut = "demandee" | "confirmee" | "refusee" | "terminee";
type DemandeExistante = { id: string; serviceKey: string; jour: string; heure: string; nbPersonnes: number; statut: Statut };
type Choix = { jour: string; heure: string; nb: number; note: string };

function fmt(n: number): string {
  return n.toLocaleString("fr-FR").replace(/\u202f/g, " ");
}

type Textes = (typeof T)["fr"];
function libellePrix(key: string, t: Textes, langue: Langue): { principal: string; detail: string } | null {
  const tarif = TARIFS[key];
  if (!tarif) return null;
  if (tarif.unite === "offert") return { principal: t.offert, detail: "" };
  if (tarif.unite === "devis") return { principal: t.devis, detail: "" };
  const unite = tarif.unite === "pers" ? ` ${t.parPers}` : tarif.unite === "jour" ? ` ${t.parJour}` : "";
  const debut = tarif.aPartirDe ? `${t.des} ` : "";
  const duree = tarif.duree ? ` · ${tarif.duree[langue]}` : "";
  return { principal: `${debut}${fmt(tarif.mad)} MAD${unite}`, detail: `≈ ${fmt(eurDepuisMad(tarif.mad))} €${duree}` };
}

const CRENEAUX_RAPIDES: { h: string; cle: "matin" | "midi" | "apresmidi" | "soir" }[] = [
  { h: "09:00", cle: "matin" },
  { h: "12:30", cle: "midi" },
  { h: "15:00", cle: "apresmidi" },
  { h: "20:00", cle: "soir" },
];

const PHOTO_CATEGORIE: Record<CategorieService, string> = {
  villa: "couscous",
  activites: "montgolfiere",
  experiences: "poterie",
  conciergerie: "reservation-restaurant",
  evenements: "diner-prive",
};

const T = {
  fr: {
    titre: "Votre séjour",
    intro: "Composez votre séjour. Nous confirmons chaque demande sur WhatsApp.",
    prixNote: "Prix en dirhams, équivalent en euros indicatif.",
    hero: "La carte",
    precisionBtn: "Ajouter une précision",
    ajouter: "Ajouter",
    retour: "La carte",
    nbServices: (n: number) => `${n} propositions`,
    ajoute: "Ajouté",
    credits: "Crédits photos",
    creneaux: { matin: "Matin", midi: "Midi", apresmidi: "Après-midi", soir: "Soir" },
    autreHeure: "Autre heure",
    envoyerCourt: "Envoyer la demande",
    selection: (n: number) => (n > 1 ? `${n} services` : `${n} service`),
    parPers: "/ pers.",
    parJour: "/ jour",
    des: "Dès",
    offert: "Offert",
    devis: "Sur devis",
    totalEstime: "Total estimé",
    totalNote: "Hors prestations sur devis. Le prix final vous est confirmé avant toute prestation.",
    bonjour: (p: string) => (p ? `Bonjour ${p}` : "Bonjour"),
    sejour: "Séjour du",
    au: "au",
    jour: "Jour",
    heure: "Heure",
    flexible: "Flexible",
    choisir: "Choisir",
    personnes: "Personnes",
    precision: "Une précision ? (facultatif)",
    envoyer: (n: number) => `Envoyer ma demande (${n})`,
    envoi: "Envoi…",
    manque: "Choisissez le jour et l'heure pour chaque service coché.",
    recu: "Demande envoyée",
    recuTexte: "Merci. Nous revenons vers vous très vite sur WhatsApp pour confirmer chaque service.",
    autre: "Faire une autre demande",
    mesDemandes: "Mes demandes",
    statuts: { demandee: "En attente", confirmee: "Confirmée", refusee: "Indisponible", terminee: "Terminée" } as Record<Statut, string>,
    pers: (n: number) => `${n} pers.`,
    retirer: "Retirer",
    erreur: "Une erreur est survenue, réessayez.",
  },
  en: {
    titre: "Your stay",
    intro: "Compose your stay. We confirm every request on WhatsApp.",
    prixNote: "Prices in dirhams, euro equivalent is indicative.",
    hero: "The menu",
    precisionBtn: "Add a note",
    ajouter: "Add",
    retour: "The menu",
    nbServices: (n: number) => `${n} options`,
    ajoute: "Added",
    credits: "Photo credits",
    creneaux: { matin: "Morning", midi: "Noon", apresmidi: "Afternoon", soir: "Evening" },
    autreHeure: "Other time",
    envoyerCourt: "Send request",
    selection: (n: number) => (n > 1 ? `${n} services` : `${n} service`),
    parPers: "/ guest",
    parJour: "/ day",
    des: "From",
    offert: "Free",
    devis: "On request",
    totalEstime: "Estimated total",
    totalNote: "Excluding services on request. The final price is confirmed before any service.",
    bonjour: (p: string) => (p ? `Hello ${p}` : "Hello"),
    sejour: "Stay from",
    au: "to",
    jour: "Day",
    heure: "Time",
    flexible: "Flexible",
    choisir: "Select",
    personnes: "Guests",
    precision: "Anything to add? (optional)",
    envoyer: (n: number) => `Send my request (${n})`,
    envoi: "Sending…",
    manque: "Please choose the day and time for each selected service.",
    recu: "Request sent",
    recuTexte: "Thank you. We will get back to you shortly on WhatsApp to confirm each service.",
    autre: "Make another request",
    mesDemandes: "My requests",
    statuts: { demandee: "Pending", confirmee: "Confirmed", refusee: "Unavailable", terminee: "Done" } as Record<Statut, string>,
    pers: (n: number) => `${n} guest${n > 1 ? "s" : ""}`,
    retirer: "Remove",
    erreur: "Something went wrong, please try again.",
  },
};

function formaterJour(iso: string, langue: Langue): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(langue === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

// Jours du séjour proposés en pastilles (au plus 31 : un séjour plus long retombe sur le choix libre).
function joursDuSejour(arrivee: string, depart: string): string[] {
  const jours: string[] = [];
  const fin = Date.parse(`${depart}T00:00:00Z`);
  for (let t = Date.parse(`${arrivee}T00:00:00Z`); t <= fin && jours.length < 31; t += 86400000) {
    jours.push(new Date(t).toISOString().slice(0, 10));
  }
  return jours;
}

export function ServicesVoyageur({
  reservationId,
  prenom,
  villaNom,
  arrivee,
  depart,
  personnesParDefaut,
  demandes,
}: {
  reservationId: string;
  prenom: string;
  villaNom: string;
  arrivee: string;
  depart: string;
  personnesParDefaut: number;
  demandes: DemandeExistante[];
}) {
  const [langue, setLangue] = useState<Langue>("en");
  const [categorie, setCategorie] = useState<CategorieService | null>(null);
  const [choix, setChoix] = useState<Record<string, Choix>>({});
  const [manquants, setManquants] = useState<Set<string>>(new Set());
  const [envoye, setEnvoye] = useState(false);
  const [notesOuvertes, setNotesOuvertes] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, startTransition] = useTransition();
  const t = T[langue];
  const jours = useMemo(() => joursDuSejour(arrivee, depart), [arrivee, depart]);

  // Langue par défaut : celle du navigateur du voyageur (français sinon anglais), mémorisée.
  useEffect(() => {
    try {
      const memo = localStorage.getItem("sejour-langue");
      if (memo === "fr" || memo === "en") {
        setLangue(memo);
        return;
      }
    } catch {}
    setLangue(navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en");
  }, []);

  function changerLangue(l: Langue) {
    setLangue(l);
    try {
      localStorage.setItem("sejour-langue", l);
    } catch {}
  }

  function ouvrir(c: CategorieService) {
    setCategorie(c);
    try {
      window.history.pushState({ cat: c }, "");
    } catch {}
    window.scrollTo({ top: 0 });
  }

  function fermer() {
    setCategorie(null);
    window.scrollTo({ top: 0 });
  }

  // Le bouton « retour » du téléphone ramène à la carte au lieu de quitter la page.
  useEffect(() => {
    const retour = () => {
      setCategorie(null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", retour);
    return () => window.removeEventListener("popstate", retour);
  }, []);

  function basculer(key: string) {
    setChoix((c) => {
      const suivant = { ...c };
      if (suivant[key]) delete suivant[key];
      else suivant[key] = { jour: jours.length === 1 ? jours[0] : "", heure: "", nb: personnesParDefaut, note: "" };
      return suivant;
    });
    setManquants((m) => {
      const s = new Set(m);
      s.delete(key);
      return s;
    });
  }

  function maj(key: string, patch: Partial<Choix>) {
    setChoix((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
    setManquants((m) => {
      const s = new Set(m);
      s.delete(key);
      return s;
    });
  }

  const nbChoisis = Object.keys(choix).length;
  const totalMad = Object.entries(choix).reduce((somme, [k, c]) => somme + (montantEstime(k, c.nb) ?? 0), 0);

  function envoyer() {
    const incomplets = Object.entries(choix).filter(([, c]) => !c.jour || !c.heure).map(([k]) => k);
    if (incomplets.length > 0) {
      setManquants(new Set(incomplets));
      setErreur(t.manque);
      const cible = SERVICE_PAR_CLE.get(incomplets[0])?.categorie ?? null;
      if (cible && cible !== categorie) setCategorie(cible);
      setTimeout(() => document.getElementById(`service-${incomplets[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      return;
    }
    setErreur(null);
    startTransition(async () => {
      try {
        const res = await envoyerDemandesServices(
          reservationId,
          Object.entries(choix).map(([serviceKey, c]) => ({ serviceKey, jour: c.jour, heure: c.heure, nbPersonnes: c.nb, note: c.note }))
        );
        if (!res.ok) {
          setErreur(res.erreur);
          return;
        }
        setEnvoye(true);
        setChoix({});
        setCategorie(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setErreur(t.erreur);
      }
    });
  }

  const services = categorie ? SERVICES.filter((s) => s.categorie === categorie) : [];
  const cat = categorie ? CATEGORIES_SERVICES.find((c) => c.key === categorie)! : null;
  const filet = "border-neutral-900";

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl bg-white pb-44 font-sans text-neutral-900">
      {!categorie ? (
        <header className="px-6 pb-8 pt-6 text-center">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em]">
            <span className="text-neutral-500">Moderna Agency</span>
            <span className="flex items-center gap-2">
              {(["fr", "en"] as const).map((l, n) => (
                <span key={l} className="flex items-center gap-2">
                  {n > 0 ? <span className="text-neutral-300">/</span> : null}
                  <button type="button" onClick={() => changerLangue(l)} className={cn("pb-0.5 uppercase", langue === l ? "border-b border-neutral-900 text-neutral-900" : "text-neutral-400")}>
                    {l}
                  </button>
                </span>
              ))}
            </span>
          </div>
          <div className="mx-auto mt-10 w-16 border-t border-neutral-900" />
          <h1 className="mt-6 font-serif text-5xl font-normal italic leading-none tracking-tight">{t.hero}</h1>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.3em] text-neutral-500">{t.bonjour(prenom)}</p>
          <p className="mx-auto mt-3 max-w-[18rem] font-serif text-[15px] italic leading-relaxed text-neutral-600">{t.intro}</p>
          <p className="mt-5 text-xs text-neutral-500">
            {villaNom ? `${villaNom} · ` : ""}
            {formaterJour(arrivee, langue)} – {formaterJour(depart, langue)}
          </p>
        </header>
      ) : (
        <header className="sticky top-0 z-20 border-b border-neutral-900 bg-white">
          <div className="flex items-center justify-between px-5 py-3.5">
            <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
              <ArrowLeft className="h-4 w-4" />
              {t.retour}
            </button>
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em]">
              {(["fr", "en"] as const).map((l, n) => (
                <span key={l} className="flex items-center gap-2">
                  {n > 0 ? <span className="text-neutral-300">/</span> : null}
                  <button type="button" onClick={() => changerLangue(l)} className={cn("pb-0.5 uppercase", langue === l ? "border-b border-neutral-900 text-neutral-900" : "text-neutral-400")}>
                    {l}
                  </button>
                </span>
              ))}
            </span>
          </div>
        </header>
      )}

      {envoye && !categorie ? (
        <div className={cn("mx-6 mb-6 border p-5 text-center", filet)}>
          <p className="font-serif text-2xl italic">{t.recu}</p>
          <p className="mt-2 text-sm text-neutral-600">{t.recuTexte}</p>
          <button type="button" onClick={() => setEnvoye(false)} className="mt-4 text-xs font-medium uppercase tracking-[0.18em] underline underline-offset-4">
            {t.autre}
          </button>
        </div>
      ) : null}

      {demandes.length > 0 && !categorie ? (
        <details className="group mx-6 mb-6 border border-neutral-200">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-[0.18em]">
            <span>
              {t.mesDemandes} ({demandes.length})
            </span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-neutral-200 border-t border-neutral-200 text-sm">
            {demandes.map((d) => {
              const sv = SERVICE_PAR_CLE.get(d.serviceKey);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-serif text-base">{sv ? sv[langue] : d.serviceKey}</span>
                    <span className="block text-xs text-neutral-500">
                      {formaterJour(d.jour, langue)} · {d.heure === HEURE_FLEXIBLE ? t.flexible : d.heure} · {t.pers(d.nbPersonnes)}
                    </span>
                  </span>
                  <span className={cn("shrink-0 border px-2 py-0.5 text-[11px] uppercase tracking-wider", d.statut === "refusee" ? "border-neutral-300 text-neutral-400 line-through" : "border-neutral-900")}>
                    {t.statuts[d.statut]}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {/* Accueil : toutes les rubriques d'un coup d'œil */}
      {!categorie ? (
        <div className="space-y-4 px-6">
          {CATEGORIES_SERVICES.map((c) => {
            const nb = Object.keys(choix).filter((k) => SERVICE_PAR_CLE.get(k)?.categorie === c.key).length;
            const total = SERVICES.filter((sv) => sv.categorie === c.key).length;
            return (
              <button key={c.key} type="button" onClick={() => ouvrir(c.key)} className="group relative block h-44 w-full overflow-hidden bg-neutral-900 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/sejour/${PHOTO_CATEGORIE[c.key]}.jpg`} alt="" width={720} height={540} className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-active:scale-105" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-white">
                  <span>
                    <span className="block font-serif text-[26px] italic leading-tight">{c[langue]}</span>
                    <span className="mt-1 block text-[11px] uppercase tracking-[0.18em] text-white/70">{t.nbServices(total)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {nb > 0 ? <span className="bg-white px-2 py-1 text-[11px] font-semibold text-neutral-900">{nb}</span> : null}
                    <ChevronRight className="h-5 w-5" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {categorie && cat ? (
      <section className="px-6 pt-10">
        <div className="pb-8 text-center">
          <h2 className="font-serif text-3xl italic">{cat[langue]}</h2>
          <div className="mx-auto mt-3 w-10 border-t border-neutral-900" />
          <p className="mt-3 text-[13px] text-neutral-500">{cat.description[langue]}</p>
        </div>

        <div className="divide-y divide-neutral-200">
          {services.map((s) => {
            const c = choix[s.key];
            const choisi = Boolean(c);
            const manque = manquants.has(s.key);
            const prix = libellePrix(s.key, t, langue);
            const desc = DESCRIPTIONS[s.key]?.[langue];
            const heureAutre = c && c.heure && c.heure !== HEURE_FLEXIBLE && !CRENEAUX_RAPIDES.some((r) => r.h === c.heure);
            return (
              <article key={s.key} id={`service-${s.key}`} className={cn("py-6", manque && "bg-neutral-50")}>
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-[19px] leading-snug">{s[langue]}</h3>
                    {desc ? <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{desc}</p> : null}
                    {prix ? (
                      <p className="mt-2.5 text-sm tabular-nums">
                        <span className="font-semibold">{prix.principal}</span>
                        {prix.detail ? <span className="text-neutral-500"> · {prix.detail}</span> : null}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => basculer(s.key)}
                      aria-pressed={choisi}
                      className={cn(
                        "mt-4 inline-flex h-10 items-center gap-2 border px-5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
                        choisi ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-900 bg-white text-neutral-900"
                      )}
                    >
                      {choisi ? t.ajoute : <><Plus className="h-3.5 w-3.5" />{t.ajouter}</>}
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/sejour/${s.key}.jpg`}
                    alt=""
                    width={720}
                    height={540}
                    loading="lazy"
                    className="h-28 w-28 shrink-0 self-start object-cover sm:h-32 sm:w-32"
                  />
                </div>

                {c ? (
                  <div className="mt-5 space-y-6 border border-neutral-200 bg-neutral-50 p-4">
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{t.jour}</p>
                      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                        {jours.map((j) => {
                          const d = new Date(`${j}T00:00:00Z`);
                          const actif = c.jour === j;
                          const loc = langue === "fr" ? "fr-FR" : "en-GB";
                          return (
                            <button
                              key={j}
                              type="button"
                              onClick={() => maj(s.key, { jour: j })}
                              className={cn(
                                "flex w-14 shrink-0 flex-col items-center border py-2 transition-colors",
                                actif ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
                              )}
                            >
                              <span className="text-[10px] uppercase tracking-wider opacity-70">{d.toLocaleDateString(loc, { weekday: "short", timeZone: "UTC" })}</span>
                              <span className="font-serif text-xl leading-tight tabular-nums">{d.getUTCDate()}</span>
                              <span className="text-[10px] uppercase tracking-wider opacity-70">{d.toLocaleDateString(loc, { month: "short", timeZone: "UTC" })}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{t.heure}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {CRENEAUX_RAPIDES.map((r) => (
                          <button
                            key={r.h}
                            type="button"
                            onClick={() => maj(s.key, { heure: r.h })}
                            className={cn("border py-2.5 text-center transition-colors", c.heure === r.h ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white")}
                          >
                            <span className="block text-sm font-semibold tabular-nums">{r.h}</span>
                            <span className="block text-[10px] uppercase tracking-wider opacity-70">{t.creneaux[r.cle]}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={heureAutre ? c.heure : ""}
                          onChange={(e) => maj(s.key, { heure: e.target.value })}
                          className={cn("h-11 min-w-0 flex-1 border bg-white px-3 text-sm", heureAutre ? "border-neutral-900" : "border-neutral-300")}
                          aria-label={t.autreHeure}
                        >
                          <option value="">{t.autreHeure}</option>
                          {CRENEAUX.filter((h) => !CRENEAUX_RAPIDES.some((r) => r.h === h)).map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => maj(s.key, { heure: HEURE_FLEXIBLE })}
                          className={cn("h-11 border px-4 text-sm transition-colors", c.heure === HEURE_FLEXIBLE ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white")}
                        >
                          {t.flexible}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{t.personnes}</p>
                      <div className="inline-flex items-center border border-neutral-300 bg-white">
                        <button type="button" onClick={() => maj(s.key, { nb: Math.max(1, c.nb - 1) })} className="flex h-11 w-11 items-center justify-center" aria-label="-">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-9 text-center font-serif text-lg tabular-nums">{c.nb}</span>
                        <button type="button" onClick={() => maj(s.key, { nb: Math.min(30, c.nb + 1) })} className="flex h-11 w-11 items-center justify-center" aria-label="+">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {c.note || notesOuvertes.has(s.key) ? (
                      <input
                        value={c.note}
                        onChange={(e) => maj(s.key, { note: e.target.value })}
                        maxLength={300}
                        placeholder={t.precision}
                        className="h-11 w-full border border-neutral-300 bg-white px-3.5 text-base placeholder:text-neutral-400"
                      />
                    ) : (
                      <button type="button" onClick={() => setNotesOuvertes((n) => new Set(n).add(s.key))} className="text-xs font-medium uppercase tracking-[0.16em] underline underline-offset-4">
                        {t.precisionBtn}
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <p className="pt-8 text-center text-xs text-neutral-500">{t.prixNote}</p>
      </section>
      ) : null}

      <div className="px-6 pt-8">
        <details className="text-center">
          <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.18em] text-neutral-400">{t.credits}</summary>
          <ul className="mt-3 space-y-1 text-left text-[10px] leading-snug text-neutral-400">
            {CREDITS_PHOTOS.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.titre}</a> · {c.auteur} · {c.licence}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {nbChoisis > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-xl">
            {erreur ? <p className="bg-red-700 px-4 py-2 text-center text-sm text-white">{erreur}</p> : null}
            <div className="flex items-center gap-4 bg-neutral-900 px-5 py-3.5 text-white">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">{t.selection(nbChoisis)}</p>
                {totalMad > 0 ? (
                  <p className="truncate font-serif text-lg tabular-nums">
                    {fmt(totalMad)} MAD <span className="font-sans text-xs text-neutral-400">≈ {fmt(eurDepuisMad(totalMad))} €</span>
                  </p>
                ) : (
                  <p className="font-serif text-lg italic">{t.devis}</p>
                )}
              </div>
              <button
                type="button"
                onClick={envoyer}
                disabled={enCours}
                className="h-11 shrink-0 bg-white px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-900 disabled:opacity-60"
              >
                {enCours ? t.envoi : t.envoyerCourt}
              </button>
            </div>
            {totalMad > 0 ? <p className="bg-neutral-900 px-5 pb-3 text-[10px] leading-snug text-neutral-500">{t.totalNote}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
