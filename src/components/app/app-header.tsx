import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/app/logo";

export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/50 bg-white/45 px-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-2xl backdrop-saturate-150 md:px-6 print:hidden dark:border-white/10 dark:bg-white/8"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-2 md:hidden">
        <Logo size={32} />
      </div>
      <div className="hidden md:block" />
      <UserButton
        appearance={{
          elements: { avatarBox: "h-8 w-8 grayscale" },
        }}
      />
    </header>
  );
}
