import { SidebarNav } from "@/components/app/sidebar-nav";
import { BottomNav } from "@/components/app/bottom-nav";
import { AppHeader } from "@/components/app/app-header";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { enregistrerConnexion } from "@/lib/journal";
import { estMembreEquipe } from "@/lib/acces";

// Toutes les pages dépendent de données live (DB + session) : jamais de rendu statique.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Double contrôle (le premier est dans src/proxy.ts) : seuls les comptes de l'équipe voient le
  // back-office, voir src/lib/acces.ts.
  const { userId } = await auth();
  if (!(await estMembreEquipe(userId))) redirect("/acces-refuse");
  // Journal : une ligne "connexion" par session (qui, quand, depuis quel appareil).
  await enregistrerConnexion();
  return (
    <div className="relative flex min-h-screen flex-1 bg-muted/40">
      <SidebarNav />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-6">
          <div className="mx-auto w-full max-w-7xl min-w-0 p-4 md:p-6">{children}</div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
