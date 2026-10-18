import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { TutoFrise } from "@/components/app/tuto-frise";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { tutoParSlug } from "@/lib/tutos";

export default async function TutoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tuto = tutoParSlug(slug);
  if (!tuto) notFound();

  return (
    <div className="max-w-xl space-y-5">
      <Link href="/tutos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="size-4" />
        Tous les tutos
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{tuto.titre}</h1>
        <CopyLinkButton path={`/tuto/${tuto.code}`} label="Copier le lien à partager" successMessage="Lien du tuto copié." />
      </div>
      <TutoFrise tuto={tuto} />
    </div>
  );
}
