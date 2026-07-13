# Moderna Agency

Application de gestion pour la conciergerie de villas : check-in/check-out
synchronisés depuis Superhote, suivi de caisse (argent confié), et états des
lieux signés avec photos. Optimisée pour smartphone et iPad.

## Fonctionnalités

- **Dashboard** — check-in et check-out du jour et des 14 prochains jours.
- **Villas** — une fiche par villa (numéro + nom), réservations associées.
- **Caisse** — argent confié, dépenses et restitutions, avec solde en temps réel.
- **Inventaire** — état des lieux d'entrée/sortie par villa : chaque équipement
  coché OK/problème, avec photo et commentaire, signature du client et de
  l'agent à la fin.
- **Superhote** — synchronisation automatique des réservations (cron toutes les
  15 min) + bouton de synchro manuelle.

## Stack

Next.js 16 (App Router, Server Actions) · Clerk (auth multi-comptes) ·
Neon Postgres + Drizzle ORM · Vercel Blob (photos/signatures) · shadcn/ui ·
Tailwind CSS.

## Démarrage local

1. Copier `.env.example` en `.env.local` et renseigner les variables.
2. `npm install`
3. `npm run db:push` — crée les tables en base.
4. `npm run dev`

## Déploiement (Vercel)

1. Importer le repo dans Vercel.
2. Installer les intégrations Marketplace : **Neon** (Postgres) et **Clerk**
   (auth) — les variables d'environnement sont provisionnées automatiquement.
3. Ajouter manuellement : `BLOB_READ_WRITE_TOKEN` (Vercel Blob),
   `SUPERHOTE_API_KEY`, `CRON_SECRET`.
4. Le cron `/api/superhote/sync` (toutes les 15 min, voir `vercel.json`) est
   activé automatiquement au déploiement.

## Superhote

⚠️ La documentation publique de Superhote ne décrit que les endpoints pour
**pousser** une réservation vers Superhote (`create-booking`,
`get-availabilities`), pas pour **lister** les réservations existantes.
`src/lib/superhote/client.ts` utilise un endpoint configurable
(`SUPERHOTE_BOOKINGS_PATH`, par défaut `/get-bookings`) — à confirmer avec le
support Superhote ou la section "API" du compte une fois disponible.

## Villas et Superhote

Chaque villa peut avoir un `superhoteListingId` (le `property_key` Superhote)
renseigné dans sa fiche, pour que la synchronisation rattache automatiquement
les réservations à la bonne villa.
