import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 p-4">
      <SignIn />
    </div>
  );
}
