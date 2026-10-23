// Écran d'attente affiché instantanément pendant qu'une page du back-office se charge (toutes
// sont rendues à la demande : base + session). Sans lui, un appui sur un lien du menu ne donnait
// aucun retour avant la réponse du serveur — l'application paraissait figée, surtout sur
// téléphone. Volontairement neutre (pas de faux contenu), même pour toutes les pages.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Chargement">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-md bg-muted" />
        <div className="h-4 w-72 max-w-full rounded-md bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-xl border bg-card" />
        <div className="h-28 rounded-xl border bg-card" />
        <div className="hidden h-28 rounded-xl border bg-card lg:block" />
      </div>
      <div className="h-72 rounded-xl border bg-card" />
    </div>
  );
}
