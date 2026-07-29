import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Normalise "wail" / "KARIM" / "jean-paul dupont" -> "Wail" / "Karim" / "Jean-Paul Dupont",
// quelle que soit la casse saisie manuellement ou reçue via iCal.
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s'"(-])([a-zà-öø-ÿ])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}
