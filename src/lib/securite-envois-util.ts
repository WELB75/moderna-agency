import type { AgentSecurite, DossierSecurite, EnvoiSecurite } from "@/lib/securite-agents";

// Fichier sans "use client" ni accès base : utilisé à la fois par les pages serveur (liste, détail,
// résumé Sécurité) et par les composants client. Une fonction exportée d'un composant client ne peut
// pas être appelée côté serveur (erreur Next « Attempted to call ... from the server »).
export const MODELE_SECURITE = "securite_arrivee_invite";
const RE_RESA = /\/securite\/villa\/([0-9a-f-]{36})/i;

// Corps du modèle Meta « securite_arrivee_invite » (arabe), tel qu'approuvé dans WhatsApp Manager.
// Le texte fixe vit chez Meta : on le reconstitue ici pour afficher dans l'app exactement ce que
// l'agent a reçu (Kamel, 2026-11-06 : « j'aimerais voir le message qui a été envoyé »).
const CORPS_MODELE =
  "السلام عليكم،\n\nضيف جديد ({{1}}) غادي يوصل إلى {{2}} (فيلا رقم {{3}}) نهار {{4}}.\n\nهذا رابط الأمن الخاص بمعلومات الضيوف:\n{{5}}\n\nشكرا";

// « [securite_arrivee_invite] Grace | Villa Sofya | 13 | 06/11/2026 | https://… » → texte lisible.
export function texteModeleSecurite(contenuJournal: string): { texte: string; lien: string | null } {
  const prefixe = `[${MODELE_SECURITE}] `;
  if (!contenuJournal.startsWith(prefixe)) return { texte: contenuJournal, lien: RE_RESA.exec(contenuJournal) ? contenuJournal : null };
  const params = contenuJournal.slice(prefixe.length).split(" | ");
  const texte = CORPS_MODELE.replace(/\{\{(\d)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
  return { texte, lien: params[4] ?? null };
}

export function dernierEnvoiParAgent(dossier: DossierSecurite, agents: AgentSecurite[]) {
  const dernier = new Map<string, EnvoiSecurite>();
  for (const e of dossier.envois) if (!dernier.has(e.destinataire)) dernier.set(e.destinataire, e);
  const lignes: { phone: string; nom: string; envoi: EnvoiSecurite | undefined }[] = agents.map((a) => ({ phone: a.phone, nom: a.nom, envoi: dernier.get(a.phone) }));
  for (const [phone, envoi] of dernier) {
    if (!lignes.some((l) => l.phone === phone)) lignes.push({ phone, nom: envoi.agentNom ?? "Ancien numéro", envoi });
  }
  return lignes;
}
