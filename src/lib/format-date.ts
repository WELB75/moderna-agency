// Affiche une date saisie via un <input type="date"> (format ISO "YYYY-MM-DD") de façon
// lisible en français. Si la valeur n'est pas au format ISO (anciennes saisies en texte
// libre), on l'affiche telle quelle plutôt que de la casser.
export function formatDateFr(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
