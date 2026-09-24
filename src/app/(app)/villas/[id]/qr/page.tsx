import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { PrintButton } from "@/components/app/print-button";
import { getBaseUrl } from "@/lib/base-url";

// Vue dédiée, volontairement réduite au strict nécessaire (rien d'autre autour) pour qu'un
// "Imprimer" depuis ici n'imprime que le QR — à afficher dans la villa pour /bienvenue/[token].
export default async function VillaQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [villa] = await db
    .select({ nom: villas.nom, numero: villas.numero, lienClientToken: villas.lienClientToken })
    .from(villas)
    .where(eq(villas.id, id))
    .limit(1);
  if (!villa) notFound();

  const url = `${getBaseUrl()}/bienvenue/${villa.lienClientToken}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 480, margin: 2 });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 p-8 text-center">
      <Logo size={56} className="print:hidden" />
      <div>
        <h1 className="text-xl font-bold">{villa.nom}</h1>
        <p className="text-sm text-muted-foreground">n°{villa.numero} — Bienvenue</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL générée côté serveur, pas une image optimisable par next/image */}
      <img src={qrDataUrl} alt={`QR code d'accueil ${villa.nom}`} width={320} height={320} className="rounded-lg border" />
      <p className="break-all text-xs text-muted-foreground">{url}</p>
      <PrintButton />
    </div>
  );
}
