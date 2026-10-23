"use client";

import { useSyncExternalStore } from "react";

// Nombre de conversations non lues (WhatsApp, Airbnb, Booking.com), rafraîchi toutes les 5 minutes
// tant que l'onglet est visible, et tout de suite quand une conversation est ouverte (évènement
// "messages-lus") — alimente la pastille "Messages" du menu.
//
// Un seul compteur partagé par toute la page : le menu latéral (ordinateur) et la barre du bas
// (téléphone) sont tous deux montés en permanence (l'un des deux masqué en CSS) et lançaient
// chacun leur propre appel — deux requêtes au lieu d'une, toutes les 2 minutes, pour chaque
// membre de l'équipe. Ici : un appel pour tous les abonnés, toutes les 5 minutes.
const INTERVALLE_MS = 5 * 60 * 1000;

let count = 0;
let abonnes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let chargementEnCours: Promise<void> | null = null;

function notifier() {
  for (const cb of abonnes) cb();
}

async function charger() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (chargementEnCours) return chargementEnCours;
  chargementEnCours = (async () => {
    try {
      const res = await fetch("/api/messages/a-repondre", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { count?: number };
      if (typeof body.count === "number" && body.count !== count) {
        count = body.count;
        notifier();
      }
    } catch {
      // réseau coupé : on garde la dernière valeur
    } finally {
      chargementEnCours = null;
    }
  })();
  return chargementEnCours;
}

function onVisibilite() {
  if (document.visibilityState === "visible") void charger();
}

function demarrer() {
  if (timer) return;
  void charger();
  timer = setInterval(() => void charger(), INTERVALLE_MS);
  document.addEventListener("visibilitychange", onVisibilite);
  window.addEventListener("messages-lus", charger);
}

function arreter() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", onVisibilite);
  window.removeEventListener("messages-lus", charger);
}

function subscribe(cb: () => void) {
  abonnes.add(cb);
  demarrer();
  return () => {
    abonnes.delete(cb);
    if (abonnes.size === 0) {
      arreter();
      abonnes = new Set();
    }
  };
}

export function useMessagesARepondre(): number {
  return useSyncExternalStore(subscribe, () => count, () => 0);
}
