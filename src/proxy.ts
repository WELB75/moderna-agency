import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/ical/sync",
  "/api/whatsapp-webhook",
  "/icon",
  "/favicon.ico",
  "/i/(.*)",
  "/g/(.*)",
  "/c/(.*)",
  "/p/(.*)",
  "/t/(.*)",
  "/r/(.*)",
  "/dossier/(.*)",
  "/securite/villa/(.*)",
  "/securite/domaine/(.*)",
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
