import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { estMembreEquipe } from "@/lib/acces";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/ical/sync",
  "/api/ical/sync-direct",
  "/api/ical/export/(.*)",
  "/api/whatsapp-webhook",
  "/api/telegram-webhook",
  "/api/staff-requests/sweep",
  "/api/maintenance/dispatch",
  "/api/beds24/sync", // cron quotidien, protégé par CRON_SECRET dans la route
  "/api/beds24/webhook", // appelé par Beds24, protégé par ?key= (BEDS24_WEBHOOK_SECRET) dans la route
  // Autorisation gérée par la route elle-même (compte Clerk, OU token technicien/villa valide en
  // base) — voir src/app/api/blob/upload/route.ts. Sans cette entrée, auth.protect() bloquait
  // déjà toute requête non connectée avant même d'atteindre ce contrôle, y compris les envois de
  // photo par un technicien (/t/[token]) ou depuis /travaux/[token].
  "/api/blob/upload",
  "/api/elevenlabs/(.*)", // Server Tools appelés par l'agent vocal ElevenLabs (Jamila) — protégés par leur propre secret bearer, voir elevenlabs-tools-auth.ts
  "/icon",
  "/favicon.ico",
  "/i/(.*)",
  "/g/(.*)",
  "/c/(.*)",
  "/p/(.*)",
  "/travaux/(.*)",
  "/t/(.*)",
  "/m/(.*)",
  "/bienvenue/(.*)",
  "/r/(.*)",
  "/s/(.*)", // récapitulatif d'une réservation directe (lien de partage par jeton)
  "/payer/(.*)",
  "/dossier/(.*)",
  "/securite/villa/(.*)",
  "/syndic/(.*)", // dossier du séjour envoyé au syndic de la résidence (comme /securite/villa)
  "/securite/domaine/(.*)",
  "/planning/(.*)",
  "/tuto/(.*)", // tuto pas à pas en lien public : le code aléatoire dans l'adresse fait office de clé (voir lib/tutos.ts)
  "/cal/(.*)", // calendrier seul d'un logement, en lecture seule (lien à part pour un propriétaire, voir lib/calendrier-partage.ts)
]);

// Page affichée à un compte connecté mais pas (encore) autorisé : il faut être connecté pour la
// voir (elle affiche l'adresse du compte), mais elle échappe au contrôle d'équipe ci-dessous.
const isPageAccesRefuse = createRouteMatcher(["/acces-refuse"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  await auth.protect();
  if (isPageAccesRefuse(req)) return;

  // 2026-10-21 : être connecté ne suffit plus, le compte doit faire partie de l'équipe (table
  // acces_equipe, voir src/lib/acces.ts). Vérifié ici pour TOUT ce qui n'est pas public : pages,
  // actions serveur (POST sur la page) et routes API du back-office.
  const { userId } = await auth();
  if (await estMembreEquipe(userId)) return;

  const estAppel = req.nextUrl.pathname.startsWith("/api/") || req.headers.has("next-action");
  if (estAppel) {
    return NextResponse.json({ error: "Accès réservé à l'équipe Superhosts." }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/acces-refuse", req.url));
});

export const config = {
  // Les flux iCal (/api/ical/export/...) sont publics et relus sans arrêt par Airbnb/Booking : ils
  // ne passent plus du tout par ici (ni Clerk ni contrôle d'équipe à faire), et sont servis depuis
  // le cache CDN — voir la route.
  matcher: [
    "/((?!_next|api/ical/export|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)((?!/ical/export).*)",
  ],
};
