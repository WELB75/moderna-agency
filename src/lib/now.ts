const TIMEZONE = "Africa/Casablanca";

/**
 * L'heure actuelle à Marrakech, représentée comme un Date "UTC" dont les
 * composants correspondent à l'heure locale marocaine. Nécessaire car les
 * dates de check-in/check-out sont stockées de la même façon (l'heure
 * affichée est stockée telle quelle en UTC, sans conversion) — comparer un
 * `new Date()` réel (vrai UTC) créerait un décalage d'1h avec le Maroc.
 */
export function nowInMorocco(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  return new Date(
    Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour") === "24" ? "0" : get("hour")),
      Number(get("minute")),
      Number(get("second"))
    )
  );
}

/**
 * Formate un Date en lisant ses composants UTC directement (jamais le fuseau du
 * navigateur/serveur), pour rester cohérent avec le stockage "heure locale marocaine
 * stockée telle quelle en UTC" utilisé partout ailleurs. À utiliser dans tout composant
 * client ("use client") qui affiche une heure de check-in/check-out/validation — sans ça,
 * l'hydratation applique le fuseau du navigateur et décale l'heure affichée d'1h.
 */
export function formatUtcTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatUtcDayMonthTime(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${mo} ${formatUtcTime(date)}`;
}
