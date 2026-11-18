"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bike, Footprints, Mountain, Sunrise, Wind, Tent, Waves, Compass, Palette, Flame, Map as MapIcon, Landmark,
  Plane, Car, ShoppingBasket, CalendarCheck, Scissors, Coffee, Utensils, Sparkles, Cake, PartyPopper, Heart,
  Camera, Music, Gift, Flower2, Wine, ClipboardList, ChefHat, HandHeart, Check, Minus, Plus, CircleCheck, Clock, TreePine, ChevronDown, MessageSquareText, Users, CalendarDays, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/app/logo";
import { envoyerDemandesServices } from "@/lib/actions/services-voyageur";
import {
  CATEGORIES_SERVICES,
  CRENEAUX,
  HEURE_FLEXIBLE,
  SERVICES,
  SERVICE_PAR_CLE,
  TARIFS,
  eurDepuisMad,
  montantEstime,
  type CategorieService,
  type ServiceIcone,
} from "@/lib/services-catalogue";
import { cn } from "@/lib/utils";

const ICONES: Record<ServiceIcone, LucideIcon> = {
  bike: Bike, footprints: Footprints, mountain: Mountain, sunrise: Sunrise, wind: Wind, tent: Tent, waves: Waves,
  compass: Compass, horse: TreePine, chef: ChefHat, palette: Palette, spa: Flower2, hand: HandHeart, flame: Flame,
  map: MapIcon, landmark: Landmark, plane: Plane, car: Car, basket: ShoppingBasket, calendar: CalendarCheck,
  scissors: Scissors, coffee: Coffee, utensils: Utensils, sparkles: Sparkles, cake: Cake, party: PartyPopper,
  heart: Heart, camera: Camera, music: Music, gift: Gift, flower: Flower2, wine: Wine, clipboard: ClipboardList,
  users: HandHeart,
};

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

const T = {
  fr: {
    titre: "Votre séjour",
    intro: "Cochez ce qui vous plaît. Nous confirmons tout sur WhatsApp.",
    prixNote: "Prix en dirhams, équivalent en euros indicatif.",
    hero: "Votre séjour, sur mesure",
    precisionBtn: "Ajouter une précision",
    creneaux: { matin: "Matin", midi: "Midi", apresmidi: "Après-midi", soir: "Soir" },
    autreHeure: "Autre heure",
    envoyerCourt: "Envoyer",
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
    intro: "Tick what you like. We confirm everything on WhatsApp.",
    prixNote: "Prices in dirhams, euro equivalent is indicative.",
    hero: "Your stay, tailor-made",
    precisionBtn: "Add a note",
    creneaux: { matin: "Morning", midi: "Noon", apresmidi: "Afternoon", soir: "Evening" },
    autreHeure: "Other time",
    envoyerCourt: "Send",
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
  const [categorie, setCategorie] = useState<CategorieService>("villa");
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
      document.getElementById(`service-${incomplets[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setErreur(t.erreur);
      }
    });
  }

  const services = SERVICES.filter((s) => s.categorie === categorie);
  const cat = CATEGORIES_SERVICES.find((c) => c.key === categorie)!;
  const OR = "text-[#d9b97a]";

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl bg-background pb-40">
      {/* Bandeau d'accueil */}
      <header className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-[#7a0a3f] via-[#660033] to-[#3a0319] px-5 pb-8 pt-5 text-white shadow-lg sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#d9b97a]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-2">
          <Logo size={34} />
          <div className="inline-flex rounded-full bg-white/10 p-0.5 text-xs font-medium backdrop-blur">
            {(["fr", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => changerLangue(l)}
                className={cn("rounded-full px-3 py-1.5 uppercase transition-colors", langue === l ? "bg-white text-[#660033]" : "text-white/80")}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="relative pt-9">
          <p className={cn("text-xs font-semibold uppercase tracking-[0.22em]", OR)}>{t.bonjour(prenom)}</p>
          <h1 className="mt-2 font-serif text-[2rem] font-medium leading-[1.1] tracking-tight">{t.hero}</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">{t.intro}</p>
          <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-xs text-white/90 backdrop-blur">
            <CalendarDays className={cn("h-3.5 w-3.5 shrink-0", OR)} />
            <span className="truncate">
              {villaNom ? `${villaNom} · ` : ""}
              {formaterJour(arrivee, langue)} → {formaterJour(depart, langue)}
            </span>
          </div>
        </div>
      </header>

      {envoye ? (
        <div className="mx-4 mt-5 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center sm:mx-6">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
            <CircleCheck className="h-6 w-6" />
          </span>
          <p className="mt-3 font-serif text-xl text-emerald-900 dark:text-emerald-200">{t.recu}</p>
          <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">{t.recuTexte}</p>
          <button type="button" onClick={() => setEnvoye(false)} className="mt-3 text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300">
            {t.autre}
          </button>
        </div>
      ) : null}

      {demandes.length > 0 ? (
        <details className="group mx-4 mt-5 overflow-hidden rounded-2xl border bg-card sm:mx-6">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-semibold">
            <span>
              {t.mesDemandes} <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-primary">{demandes.length}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y border-t text-sm">
            {demandes.map((d) => {
              const sv = SERVICE_PAR_CLE.get(d.serviceKey);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{sv ? sv[langue] : d.serviceKey}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formaterJour(d.jour, langue)} · {d.heure === HEURE_FLEXIBLE ? t.flexible : d.heure} · {t.pers(d.nbPersonnes)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      d.statut === "confirmee" && "bg-emerald-100 text-emerald-800",
                      d.statut === "demandee" && "bg-amber-100 text-amber-800",
                      d.statut === "refusee" && "bg-red-100 text-red-800",
                      d.statut === "terminee" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {t.statuts[d.statut]}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {/* Rubriques */}
      <nav className="sticky top-0 z-20 mt-5 bg-background/90 backdrop-blur-md" aria-label="Catégories">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-6 [scrollbar-width:none]">
          {CATEGORIES_SERVICES.map((c) => {
            const nb = Object.keys(choix).filter((k) => SERVICE_PAR_CLE.get(k)?.categorie === c.key).length;
            const actif = categorie === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategorie(c.key)}
                className={cn(
                  "relative shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-all",
                  actif ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted text-foreground/70"
                )}
              >
                {c[langue]}
                {nb > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d9b97a] px-1 text-[11px] font-bold text-[#3a0319]">{nb}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <section className="space-y-3 px-4 pt-2 sm:px-6">
        <div className="pb-1 pt-1">
          <h2 className="font-serif text-2xl tracking-tight">{cat[langue]}</h2>
          <p className="text-sm text-muted-foreground">{cat.description[langue]}</p>
        </div>
        {services.map((s) => {
          const Icone = ICONES[s.icone];
          const c = choix[s.key];
          const choisi = Boolean(c);
          const manque = manquants.has(s.key);
          const prix = libellePrix(s.key, t, langue);
          const heureAutre = c && c.heure && c.heure !== HEURE_FLEXIBLE && !CRENEAUX_RAPIDES.some((r) => r.h === c.heure);
          return (
            <div
              key={s.key}
              id={`service-${s.key}`}
              className={cn(
                "overflow-hidden rounded-3xl border bg-card transition-all duration-200",
                choisi ? "border-primary/50 bg-accent/40 shadow-lg shadow-primary/10" : "border-border/70 shadow-sm",
                manque && "border-red-400"
              )}
            >
              <button type="button" onClick={() => basculer(s.key)} className="flex w-full items-center gap-3.5 p-4 text-left" aria-pressed={choisi}>
                <span
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors",
                    choisi ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
                  )}
                >
                  <Icone className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{s[langue]}</span>
                  {prix ? (
                    <span className="mt-1 block text-[13px] leading-snug">
                      <span className="font-semibold tabular-nums text-primary">{prix.principal}</span>
                      {prix.detail ? <span className="text-muted-foreground"> · {prix.detail}</span> : null}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all",
                    choisi ? "scale-100 border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {choisi ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>

              {c ? (
                <div className="space-y-5 border-t border-primary/10 px-4 pb-4 pt-4">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t.jour}</p>
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                      {jours.map((j) => {
                        const d = new Date(`${j}T00:00:00Z`);
                        const actif = c.jour === j;
                        return (
                          <button
                            key={j}
                            type="button"
                            onClick={() => maj(s.key, { jour: j })}
                            className={cn(
                              "flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition-colors",
                              actif ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                            )}
                          >
                            <span className="text-[10px] font-medium uppercase opacity-70">
                              {d.toLocaleDateString(langue === "fr" ? "fr-FR" : "en-GB", { weekday: "short", timeZone: "UTC" })}
                            </span>
                            <span className="text-lg font-semibold leading-tight tabular-nums">{d.getUTCDate()}</span>
                            <span className="text-[10px] opacity-70">
                              {d.toLocaleDateString(langue === "fr" ? "fr-FR" : "en-GB", { month: "short", timeZone: "UTC" })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t.heure}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CRENEAUX_RAPIDES.map((r) => (
                        <button
                          key={r.h}
                          type="button"
                          onClick={() => maj(s.key, { heure: r.h })}
                          className={cn(
                            "rounded-xl border px-3 py-2.5 text-left transition-colors",
                            c.heure === r.h ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                          )}
                        >
                          <span className="block text-sm font-semibold tabular-nums">{r.h}</span>
                          <span className="block text-[11px] opacity-70">{t.creneaux[r.cle]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={heureAutre ? c.heure : ""}
                        onChange={(e) => maj(s.key, { heure: e.target.value })}
                        className={cn(
                          "h-11 min-w-0 flex-1 rounded-xl border bg-card px-3 text-sm",
                          heureAutre ? "border-primary" : "border-border"
                        )}
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
                        className={cn(
                          "inline-flex h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-medium transition-colors",
                          c.heure === HEURE_FLEXIBLE ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                        {t.flexible}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {t.personnes}
                    </p>
                    <div className="inline-flex items-center rounded-full border border-border bg-card">
                      <button type="button" onClick={() => maj(s.key, { nb: Math.max(1, c.nb - 1) })} className="flex h-11 w-11 items-center justify-center" aria-label="-">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-base font-semibold tabular-nums">{c.nb}</span>
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
                      className="h-11 w-full rounded-xl border border-border bg-card px-3.5 text-base placeholder:text-muted-foreground"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNotesOuvertes((n) => new Set(n).add(s.key))}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                    >
                      <MessageSquareText className="h-4 w-4" />
                      {t.precisionBtn}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        <p className="pt-3 text-center text-xs text-muted-foreground">{t.prixNote}</p>
      </section>

      {nbChoisis > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto max-w-xl space-y-2">
            {erreur ? <p className="rounded-xl bg-red-600 px-3 py-2 text-center text-sm text-white shadow-lg">{erreur}</p> : null}
            <div className="flex items-center gap-3 rounded-[1.75rem] bg-gradient-to-r from-[#660033] to-[#3a0319] p-2 pl-5 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-white/60">{t.selection(nbChoisis)}</p>
                {totalMad > 0 ? (
                  <p className="truncate text-[15px] font-semibold tabular-nums">
                    {fmt(totalMad)} MAD <span className={cn("font-normal", OR)}>≈ {fmt(eurDepuisMad(totalMad))} €</span>
                  </p>
                ) : (
                  <p className="text-sm text-white/80">{t.devis}</p>
                )}
              </div>
              <button
                type="button"
                onClick={envoyer}
                disabled={enCours}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-[1.25rem] bg-[#d9b97a] px-5 text-[15px] font-semibold text-[#3a0319] transition-transform active:scale-95 disabled:opacity-60"
              >
                {enCours ? t.envoi : t.envoyerCourt}
                {enCours ? null : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
            {totalMad > 0 ? <p className="text-center text-[11px] text-muted-foreground">{t.totalNote}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
