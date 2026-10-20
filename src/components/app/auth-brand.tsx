import { Logo, Wordmark } from "@/components/app/logo";

export function AuthBrand() {
  return (
    <div className="mb-8 flex items-center gap-3">
      <Logo size={44} />
      <Wordmark className="text-3xl text-[#222222]" />
    </div>
  );
}
