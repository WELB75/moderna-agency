import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
  "/payer/(.*)",
  "/dossier/(.*)",
  "/securite/villa/(.*)",
  "/securite/domaine/(.*)",
  "/planning/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
