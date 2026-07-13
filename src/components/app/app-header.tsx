import { UserButton } from "@clerk/nextjs";

export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <span className="text-lg font-semibold tracking-tight md:hidden">Moderna Agency</span>
      <div className="hidden md:block" />
      <UserButton />
    </header>
  );
}
