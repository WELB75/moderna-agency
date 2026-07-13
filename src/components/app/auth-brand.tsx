import { Monogram } from "@/components/app/monogram";
import { Wordmark } from "@/components/app/wordmark";

export function AuthBrand() {
  return (
    <div className="mb-8 flex flex-col items-center gap-4">
      <Monogram className="h-16 w-16 text-black" />
      <Wordmark className="text-xs text-black" />
    </div>
  );
}
