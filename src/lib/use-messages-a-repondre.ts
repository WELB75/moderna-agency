"use client";

import { useEffect, useState } from "react";

// Nombre de conversations à répondre (WhatsApp, Airbnb, Booking.com), rafraîchi toutes les
// 2 minutes tant que l'onglet est visible — alimente la pastille "Messages" du menu.
export function useMessagesARepondre(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let annule = false;
    async function charger() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/messages/a-repondre", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { count?: number };
        if (!annule && typeof body.count === "number") setCount(body.count);
      } catch {
        // réseau coupé : on garde la dernière valeur
      }
    }
    charger();
    const timer = setInterval(charger, 2 * 60 * 1000);
    document.addEventListener("visibilitychange", charger);
    return () => {
      annule = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", charger);
    };
  }, []);
  return count;
}
