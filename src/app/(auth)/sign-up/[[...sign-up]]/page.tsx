import { SignUp } from "@clerk/nextjs";
import { AuthBrand } from "@/components/app/auth-brand";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-white p-4">
      <AuthBrand />
      <SignUp appearance={clerkAppearance} />
    </div>
  );
}
