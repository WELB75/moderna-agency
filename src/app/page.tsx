import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ChefHat,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wrench,
  Star,
  Building2,
  Users,
} from "lucide-react";
import { getDb } from "@/db";
import { villas, domaines, personnel, reservations, technicians } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toWhatsAppUrl } from "@/lib/phone";

const CONTACT_PHONE = "+212668730909";

// Vitrine publique de Moderna Agency (Kamel, 2026-09-04 : "faire un site comme celui-ci
// [millenium-connect.com] mais pour moderna, qui explique tout en détail, et toujours dans ce
// meme design") — même charte violette que l'app (voir globals.css), mais présentée aux
// propriétaires plutôt qu'aux équipes internes : ce que fait réellement l'agence, pas une liste
// de fonctionnalités logicielles abstraites. Route rendue publique dans proxy.ts (elle
// redirigeait auparavant tout le monde vers /dashboard, protégé par Clerk).
export default async function HomePage() {
  const db = getDb();
  const [villasCount, domainesCount, personnelCount, reservationsCount, techniciensCount] = await Promise.all([
    db.select({ n: count() }).from(villas),
    db.select({ n: count() }).from(domaines),
    db.select({ n: count() }).from(personnel).where(eq(personnel.actif, true)),
    db.select({ n: count() }).from(reservations),
    db.select({ n: count() }).from(technicians),
  ]);

  const stats = [
    { value: `${villasCount[0].n}`, label: "Villas gérées" },
    { value: `${reservationsCount[0].n}+`, label: "Séjours pris en charge" },
    { value: `${personnelCount[0].n}`, label: "Personnes dans l'équipe" },
    { value: "24/7", label: "Assistant WhatsApp" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-white to-violet-50 text-foreground dark:from-[#150f2e] dark:via-[#120e24] dark:to-[#120e24]">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white/70 backdrop-blur-xl backdrop-saturate-150 dark:bg-black/20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <Logo size={40} />
            <span className="font-heading text-lg font-semibold">Moderna Agency</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#services" className="hover:text-foreground">Ce qu&apos;on fait</a>
            <a href="#agents" className="hover:text-foreground">Nos agents IA</a>
            <a href="#proprietaires" className="hover:text-foreground">Propriétaires</a>
            <a href="#contact" className="hover:text-foreground">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard">Se connecter</Link>
            </Button>
            <Button asChild>
              <a href="#contact">
                Confiez-nous votre villa
                <ArrowRight />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:px-6 md:pt-24">
        <span className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm dark:bg-white/5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          MODERNA AGENCY · MARRAKECH
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-tight font-semibold md:text-6xl">
          La gestion <em className="text-primary not-italic font-heading italic">intelligente</em> de votre villa à
          Marrakech
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
          Réservations, ménage, cuisine, maintenance, sécurité et comptabilité — coordonnés par notre équipe et nos
          agents IA, pendant que vous restez tranquille.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <a href="#contact">
              Confiez-nous votre villa
              <ArrowRight />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#services">Découvrir comment ça marche</a>
          </Button>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-white/70 p-4 shadow-sm dark:bg-white/5">
              <p className="font-heading text-2xl font-semibold md:text-3xl">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Ce qu&apos;on fait</span>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">Tout ce que demande une villa, géré à votre place</h2>
          <p className="mt-3 text-muted-foreground">
            {domainesCount[0].n} domaines, {villasCount[0].n} villas, une seule équipe qui s&apos;occupe de tout —
            avec des outils qu&apos;on a construits nous-mêmes pour ne rien laisser passer.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: CalendarClock,
              title: "Réservations centralisées",
              body:
                "Toutes vos réservations (Airbnb, Booking.com, direct) synchronisées dans un seul calendrier, avec check-in/check-out suivis étape par étape.",
            },
            {
              icon: MessageCircle,
              title: "Assistant client 24/7",
              body:
                "Un agent WhatsApp répond aux voyageurs en français, arabe, darija ou anglais — texte ou vocal — et peut créer une réservation à toute heure.",
            },
            {
              icon: ChefHat,
              title: "Ménage & cuisine coordonnés",
              body:
                "L'équipe la plus proche du domaine est proposée automatiquement, chaque prestation est confirmée et notée, sans rien passer à la trappe.",
            },
            {
              icon: Wrench,
              title: "Maintenance intelligente",
              body:
                "Dès qu'un problème est signalé avec une photo, notre agent IA contacte et négocie avec le bon technicien — en darija — et suit l'intervention jusqu'au bout.",
            },
            {
              icon: ShieldCheck,
              title: "Sécurité & conformité",
              body:
                "Fiche de police (gendarmerie) et contrat de location générés et suivis pour chaque séjour, sans paperasse manuelle de votre côté.",
            },
            {
              icon: Wallet,
              title: "Transparence financière",
              body:
                "Caisse, dépenses et statistiques d'occupation en temps réel, avec des rapports clairs — vous savez toujours où en est votre villa.",
            },
          ].map((f) => (
            <Card key={f.title} className="p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-heading text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Agents IA */}
      <section id="agents" className="bg-[#150f2e] py-20 text-[#edeafb]">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              NOS AGENTS IA
            </span>
            <h2 className="mt-4 font-heading text-3xl font-semibold md:text-4xl">
              Une équipe qui ne dort jamais
            </h2>
            <p className="mt-3 text-[#a79fc7]">
              Trois agents spécialisés, construits en interne, qui prennent en charge une partie de l&apos;exploitation
              — vous et l&apos;équipe gardez toujours la main sur les décisions qui comptent.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Agent réservation",
                body:
                  "Répond aux demandes WhatsApp (texte et vocal), présente les villas disponibles, crée la réservation et envoie le lien de paiement — 24h/24, en plusieurs langues.",
              },
              {
                title: "Agent maintenance",
                body:
                  "Analyse chaque signalement (avec photo), identifie le bon technicien, négocie l'intervention en darija et suit l'avancement jusqu'à la résolution.",
              },
              {
                title: "Agent équipe",
                body:
                  "Aide à dispatcher le ménage et la cuisine selon la proximité et les notes qualité, et tient le planning de chaque personne à jour.",
              },
            ].map((a) => (
              <div key={a.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="font-heading text-lg font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm text-[#c9c3e8]">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Propriétaires */}
      <section id="proprietaires" className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Propriétaires</span>
            <h2 className="mt-2 text-3xl font-semibold md:text-4xl">
              Votre villa, sous contrôle, sans y penser
            </h2>
            <p className="mt-4 text-muted-foreground">
              Vous gardez un œil sur tout sans avoir à gérer le quotidien : occupation, entretien, incidents et
              finances de votre bien, suivis par une équipe qui répond vite.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Suivi des réservations et du calendrier de votre villa",
                "Visibilité sur les interventions de maintenance en cours",
                "Rapport de caisse et statistiques d'occupation clairs",
                "Une équipe joignable directement par WhatsApp",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Building2, value: `${villasCount[0].n}`, label: "villas gérées activement" },
              { icon: Users, value: `${techniciensCount[0].n}`, label: "techniciens partenaires" },
              { icon: CalendarClock, value: `${domainesCount[0].n}`, label: "domaines à Marrakech" },
              { icon: ShieldCheck, value: "100%", label: "séjours avec fiche police" },
            ].map((s) => (
              <Card key={s.label} className="flex flex-col items-start gap-2 p-5">
                <s.icon className="h-5 w-5 text-primary" />
                <p className="font-heading text-2xl font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / CTA */}
      <section id="contact" className="mx-auto max-w-4xl px-4 pb-24 md:px-6">
        <Card className="flex flex-col items-center gap-5 p-10 text-center">
          <h2 className="text-3xl font-semibold md:text-4xl">Confiez-nous votre villa</h2>
          <p className="max-w-md text-muted-foreground">
            Parlons de votre bien à Marrakech — on vous explique comment on travaille, sans engagement.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <a href={toWhatsAppUrl(CONTACT_PHONE, "Bonjour, je souhaite en savoir plus sur la gestion de villa avec Moderna Agency.")} target="_blank" rel="noreferrer">
                <MessageCircle />
                Nous écrire sur WhatsApp
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="tel:+212668730909">+212 6 68 73 09 09</a>
            </Button>
          </div>
        </Card>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Moderna Agency · Marrakech
      </footer>
    </div>
  );
}
