import { PlatformIcon, WhatsAppIcon } from "@/components/app/platform-badge";
import { canalLabel, canalPillStyle, normaliseCanal, SOURCE_META, type SourceKey } from "@/lib/canal";
import { cn } from "@/lib/utils";

// Pastille ronde de canal (façon SuperHote v2) utilisée partout : barres du calendrier, listes,
// cartes de réservation, boîte de réception. Les logos Airbnb / Booking.com / WhatsApp sont ceux
// déjà présents dans platform-badge.tsx (tracés simple-icons) ; "En direct" et les autres canaux
// n'ont pas de logo : simple lettre (D, ou l'initiale du canal) sur fond de couleur.
// Pas de "use client" : composant sans état, utilisable côté serveur comme côté client.

const SIZES = {
  xs: { box: "h-4 w-4", icon: "h-2.5 w-2.5", text: "text-[8px]" },
  sm: { box: "h-5 w-5", icon: "h-3 w-3", text: "text-[10px]" },
  md: { box: "h-6 w-6", icon: "h-3.5 w-3.5", text: "text-[11px]" },
  lg: { box: "h-7 w-7", icon: "h-4 w-4", text: "text-[13px]" },
} as const;

export type CanalBadgeSize = keyof typeof SIZES;

function resolveSource(canal: string | null | undefined, source: SourceKey | undefined): SourceKey {
  return source ?? normaliseCanal(canal);
}

export function CanalDot({
  canal,
  source,
  size = "sm",
  className,
}: {
  canal?: string | null;
  source?: SourceKey;
  size?: CanalBadgeSize;
  className?: string;
}) {
  const key = resolveSource(canal, source);
  const meta = SOURCE_META[key];
  const s = SIZES[size];
  const label = source ? meta.label : canalLabel(canal);

  // Booking.com : le tracé simple-icons est un carré plein avec le "B." évidé — rempli en bleu
  // et rogné en cercle, il donne directement un disque bleu nuit avec "B." en blanc.
  if (key === "booking") {
    return (
      <span
        className={cn("inline-flex shrink-0 overflow-hidden rounded-full bg-white", s.box, className)}
        style={{ color: meta.brand }}
        title={label}
        aria-label={label}
        role="img"
      >
        <PlatformIcon platform="booking" className="h-full w-full scale-125" />
      </span>
    );
  }

  const letter = key === "autre" ? (canal?.trim()[0]?.toUpperCase() ?? meta.letter) : meta.letter;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white", s.box, className)}
      style={{ backgroundColor: meta.brand }}
      title={label}
      aria-label={label}
      role="img"
    >
      {key === "airbnb" ? (
        <PlatformIcon platform="airbnb" className={s.icon} />
      ) : key === "whatsapp" ? (
        <WhatsAppIcon className={s.icon} />
      ) : (
        <span className={s.text}>{letter}</span>
      )}
    </span>
  );
}

// Pastille + libellé (remplace PlatformBadge dans les listes et cartes) ; avec label={false},
// juste la pastille ronde.
export function CanalBadge({
  canal,
  source,
  label = true,
  size = "sm",
  className,
}: {
  canal?: string | null;
  source?: SourceKey;
  label?: boolean;
  size?: CanalBadgeSize;
  className?: string;
}) {
  if (!label) return <CanalDot canal={canal} source={source} size={size} className={className} />;

  const key = resolveSource(canal, source);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium", className)}
      style={canalPillStyle(key)}
    >
      <CanalDot canal={canal} source={source} size="xs" />
      {source ? SOURCE_META[key].label : canalLabel(canal)}
    </span>
  );
}
