import { notFound } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { TutoFrise } from "@/components/app/tuto-frise";
import { tutoParCode } from "@/lib/tutos";

// Lien public d'un tuto, sans compte : le code aléatoire dans l'adresse fait office de clé.
export default async function TutoPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tuto = tutoParCode(token);
  if (!tuto) notFound();

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-xl space-y-5 p-4 pb-12">
        <div className="flex items-center gap-2 pt-2">
          <Logo />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{tuto.titre}</h1>
        <TutoFrise tuto={tuto} />
      </div>
    </div>
  );
}
