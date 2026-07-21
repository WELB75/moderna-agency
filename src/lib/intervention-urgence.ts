export type Urgence = "basse" | "normale" | "haute" | "critique";

export const URGENCE_LEVELS: {
  key: Urgence;
  label: string;
  labelAr: string;
  badgeClassName: string;
}[] = [
  {
    key: "critique",
    label: "Critique",
    labelAr: "عاجل جدا",
    badgeClassName: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  {
    key: "haute",
    label: "Haute",
    labelAr: "عاجل",
    badgeClassName: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  {
    key: "normale",
    label: "Normale",
    labelAr: "عادي",
    badgeClassName: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  {
    key: "basse",
    label: "Basse",
    labelAr: "غير مستعجل",
    badgeClassName: "border-muted-foreground/30 bg-muted text-muted-foreground",
  },
];

const ORDER: Record<Urgence, number> = {
  critique: 0,
  haute: 1,
  normale: 2,
  basse: 3,
};

export function urgenceInfo(urgence: Urgence) {
  return URGENCE_LEVELS.find((u) => u.key === urgence) ?? URGENCE_LEVELS[2];
}

export function sortByUrgence<T extends { urgence: Urgence; createdAt: Date }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const diff = ORDER[a.urgence] - ORDER[b.urgence];
    if (diff !== 0) return diff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
