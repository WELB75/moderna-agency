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
