import Link from "next/link";
import { Building2, Home } from "lucide-react";

export default function ProprietairesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Propriétaires</h1>
        <p className="text-sm text-muted-foreground">Contacts des propriétaires, par logement</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/proprietaires/villas"
          className="flex flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-current text-blue-600 dark:text-blue-400">
            <Building2 className="h-9 w-9" strokeWidth={1.5} />
          </div>
          <span className="font-medium">Villas</span>
        </Link>
        <Link
          href="/proprietaires/appartements"
          className="flex flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-current text-orange-600 dark:text-orange-400">
            <Home className="h-9 w-9" strokeWidth={1.5} />
          </div>
          <span className="font-medium">Appartements</span>
        </Link>
      </div>
    </div>
  );
}
