"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bike, Footprints, Mountain, Sunrise, Wind, Tent, Waves, Compass, Palette, Flame, Map as MapIcon, Landmark,
  Plane, Car, ShoppingBasket, CalendarCheck, Scissors, Coffee, Utensils, Sparkles, Cake, PartyPopper, Heart,
  Camera, Music, Gift, Flower2, Wine, ClipboardList, ChefHat, HandHeart, Check, Minus, Plus, CircleCheck, Clock, X, TreePine,
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

const T = {
  fr: {
    titre: "Votre séjour",
    intro: "Choisissez ce qui vous fait envie : le jour, l'heure et le nombre de personnes. Notre équipe vous confirme chaque demande par WhatsApp, avec les disponibilités.",
    prixNote: "Prix en dirhams (MAD), avec l'équivalent approximatif en euros. Tarifs indicatifs, confirmés par notre équipe.",
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
    intro: "Pick what you like: the day, the time and the number of guests. Our team confirms each request on WhatsApp, with availability.",
    prixNote: "Prices in Moroccan dirhams (MAD), with the approximate equivalent in euros. Indicative rates, confirmed by our team.",
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

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl pb-44">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-6">
        <Logo size={36} />
        <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs font-medium">
          {(["fr", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => changerLangue(l)}
              className={cn("rounded-full px-3 py-1.5 uppercase", langue === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-1 px-4 pb-4 pt-6 sm:px-6">
        <p className="text-sm text-muted-foreground">{t.bonjour(prenom)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t.titre}</h1>
        <p className="text-sm text-muted-foreground">
          {villaNom ? `${villaNom} · ` : ""}
          {t.sejour} {formaterJour(arrivee, langue)} {t.au} {formaterJour(depart, langue)}
        </p>
        <p className="pt-2 text-sm leading-relaxed text-foreground/80">{t.intro}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t.prixNote}</p>
      </div>

      {envoye ? (
        <div className="mx-4 mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:mx-6">
          <p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
            <CircleCheck className="h-5 w-5" />
            {t.recu}
          </p>
          <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">{t.recuTexte}</p>
          <button type="button" onClick={() => setEnvoye(false)} className="mt-3 text-sm font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300">
            {t.autre}
          </button>
        </div>
      ) : null}

      {demandes.length > 0 ? (
        <section className="mx-4 mb-5 space-y-2 sm:mx-6">
          <h2 className="text-sm font-semibold">{t.mesDemandes}</h2>
          <ul className="divide-y rounded-2xl border bg-card text-sm">
            {demandes.map((d) => {
              const s = SERVICE_PAR_CLE.get(d.serviceKey);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s ? s[langue] : d.serviceKey}</span>
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
        </section>
      ) : null}

      {/* Rubriques : défilent à l'horizontale et restent collées en haut pendant le défilement. */}
      <nav className="sticky top-0 z-20 border-y bg-background/95 backdrop-blur" aria-label="Catégories">
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 [scrollbar-width:none]">
          {CATEGORIES_SERVICES.map((c) => {
            const nb = Object.keys(choix).filter((k) => SERVICE_PAR_CLE.get(k)?.categorie === c.key).length;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategorie(c.key)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  categorie === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
                )}
              >
                {c[langue]}
                {nb > 0 ? <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs">{nb}</span> : null}
              </button>
            );
          })}
        </div>
      </nav>

      <section className="space-y-3 px-4 pt-5 sm:px-6">
        <p className="text-sm text-muted-foreground">{cat.description[langue]}</p>
        {services.map((s) => {
          const Icone = ICONES[s.icone];
          const c = choix[s.key];
          const choisi = Boolean(c);
          const manque = manquants.has(s.key);
          const prix = libellePrix(s.key, t, langue);
          return (
            <div
              key={s.key}
              id={`service-${s.key}`}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card transition-colors",
                choisi ? "border-primary/60 shadow-[0_0_0_1px] shadow-primary/30" : "border-border",
                manque && "border-red-400"
              )}
            >
              <button type="button" onClick={() => basculer(s.key)} className="flex w-full items-center gap-3 p-3.5 text-left" aria-pressed={choisi}>
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", choisi ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
                  <Icone className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug">{s[langue]}</span>
                  {prix ? (
                    <span className="mt-0.5 block text-sm">
                      <span className="font-semibold tabular-nums text-foreground">{prix.principal}</span>
                      {prix.detail ? <span className="text-muted-foreground"> · {prix.detail}</span> : null}
                    </span>
                  ) : null}
                </span>
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", choisi ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {choisi ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
              </button>

              {c ? (
                <div className="space-y-4 border-t bg-muted/30 p-3.5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.jour}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {jours.map((j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => maj(s.key, { jour: j })}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm capitalize",
                            c.jour === j ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                          )}
                        >
                          {formaterJour(j, langue)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.heure}</p>
                    <div className="flex gap-2">
                      <select
                        value={c.heure === HEURE_FLEXIBLE ? "" : c.heure}
                        onChange={(e) => maj(s.key, { heure: e.target.value })}
                        className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-base"
                        aria-label={t.heure}
                      >
                        <option value="">{t.choisir}</option>
                        {CRENEAUX.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => maj(s.key, { heure: HEURE_FLEXIBLE })}
                        className={cn(
                          "inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm",
                          c.heure === HEURE_FLEXIBLE ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                        {t.flexible}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.personnes}</p>
                    <div className="inline-flex items-center rounded-lg border border-border bg-card">
                      <button type="button" onClick={() => maj(s.key, { nb: Math.max(1, c.nb - 1) })} className="flex h-11 w-11 items-center justify-center" aria-label="-">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-base font-semibold tabular-nums">{c.nb}</span>
                      <button type="button" onClick={() => maj(s.key, { nb: Math.min(30, c.nb + 1) })} className="flex h-11 w-11 items-center justify-center" aria-label="+">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <input
                    value={c.note}
                    onChange={(e) => maj(s.key, { note: e.target.value })}
                    maxLength={300}
                    placeholder={t.precision}
                    className="h-11 w-full rounded-lg border border-border bg-card px-3 text-base placeholder:text-muted-foreground"
                  />
                  <button type="button" onClick={() => basculer(s.key)} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4">
                    <X className="h-3 w-3" />
                    {t.retirer}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {nbChoisis > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl space-y-2 sm:px-3">
            {erreur ? <p className="text-center text-sm text-red-600">{erreur}</p> : null}
            {totalMad > 0 ? (
              <div className="px-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{t.totalEstime}</span>
                  <span className="font-semibold tabular-nums">
                    {fmt(totalMad)} MAD <span className="font-normal text-muted-foreground">· ≈ {fmt(eurDepuisMad(totalMad))} €</span>
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{t.totalNote}</p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={envoyer}
              disabled={enCours}
              className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
            >
              {enCours ? t.envoi : t.envoyer(nbChoisis)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
