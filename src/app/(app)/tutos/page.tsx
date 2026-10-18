import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TUTOS } from "@/lib/tutos";

// Tutos : procédures pas à pas en photos (chauffage de la piscine...), pour toute personne qui
// a accès à l'app. Chaque tuto a aussi un lien public à envoyer sans compte (/tuto/[code]).
export default function TutosPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tutos</h1>
        <p className="text-sm text-muted-foreground">Des procédures simples, photo après photo, à suivre de la première étape jusqu&apos;à la fin.</p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {TUTOS.map((t) => (
          <li key={t.slug}>
            <Link href={`/tutos/${t.slug}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
              <span className="min-w-0">
                <span className="block font-medium">
                  {t.titre}
                  {t.brouillon ? <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">Brouillon</span> : null}
                </span>
                <span className="block text-sm text-muted-foreground">{t.resume}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
