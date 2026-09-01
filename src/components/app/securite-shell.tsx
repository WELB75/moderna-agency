import { Logo } from "@/components/app/logo";
import { ShieldCheck } from "lucide-react";

// Habillage commun aux liens publics de contrôle sécurité (par réservation et par domaine) :
// présentation soignée, pensée pour être montrée telle quelle sur un écran ou imprimée — Kamel,
// 2026-09-01, à propos d'une démo au ministre de la Défense marocain : "rend ça propre fluide et
// pro". Fond doux hors impression, carte blanche nette à l'impression (print:).
export function SecuriteShell({
  eyebrow,
  subtitle,
  children,
}: {
  eyebrow: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-white print:bg-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14 print:max-w-none print:p-0">
        {/* Habillage Moderna Agency, jamais mêlé aux fiches officielles imprimées (mêmes règles
            que /gendarmerie/[id] : à l'impression, seuls les logos Sûreté Nationale/Gendarmerie
            Royale portés par chaque fiche doivent apparaître). */}
        <div className="flex flex-col items-center gap-3 pb-8 text-center print:hidden">
          <Logo size={60} />
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary print:border-none print:bg-transparent">
            <ShieldCheck className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <p className="max-w-md text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="space-y-4 rounded-3xl border border-border/60 bg-card/80 p-5 shadow-[0_8px_40px_-16px_rgba(15,23,42,0.15)] backdrop-blur-sm sm:p-8 print:space-y-6 print:rounded-none print:border-none print:bg-transparent print:p-0 print:shadow-none">
          {children}
        </div>

        <p className="pt-8 text-center text-xs text-muted-foreground print:pt-6">Lien de contrôle Moderna Agency</p>
      </div>
    </div>
  );
}
