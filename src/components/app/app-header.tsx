import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:px-6 print:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-2 md:hidden">
        <Logo size={32} />
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserButton
          appearance={{
            elements: { avatarBox: "h-8 w-8" },
          }}
        />
      </div>
    </header>
  );
}
