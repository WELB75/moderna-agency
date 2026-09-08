import { SidebarNav } from "@/components/app/sidebar-nav";
import { BottomNav } from "@/components/app/bottom-nav";
import { AppHeader } from "@/components/app/app-header";
import { getUnreadChatCount } from "@/lib/actions/chat";

// Toutes les pages dépendent de données live (DB + session) : jamais de rendu statique.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const unreadChatCount = await getUnreadChatCount();

  return (
    <div className="relative flex min-h-screen flex-1 bg-muted/40">
      <SidebarNav unreadChatCount={unreadChatCount} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-6">
          <div className="mx-auto w-full max-w-7xl min-w-0 p-4 md:p-6">{children}</div>
        </main>
      </div>
      <BottomNav unreadChatCount={unreadChatCount} />
    </div>
  );
}
