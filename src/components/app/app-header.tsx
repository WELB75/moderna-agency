import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/app/logo";

export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
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
