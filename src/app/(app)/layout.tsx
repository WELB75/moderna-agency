import { SidebarNav } from "@/components/app/sidebar-nav";
import { BottomNav } from "@/components/app/bottom-nav";
import { AppHeader } from "@/components/app/app-header";
import { getUnreadChatCount } from "@/lib/actions/chat";
import { isKamel } from "@/lib/access";

// Toutes les pages dépendent de données live (DB + session) : jamais de rendu statique.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const unreadChatCount = await getUnreadChatCount();
  const hiddenHrefs = (await isKamel()) ? [] : ["/agent-ia"];

  return (
    <div className="flex min-h-screen flex-1">
      <SidebarNav unreadChatCount={unreadChatCount} hiddenHrefs={hiddenHrefs} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
        </main>
      </div>
      <BottomNav unreadChatCount={unreadChatCount} hiddenHrefs={hiddenHrefs} />
    </div>
  );
}
