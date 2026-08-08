import { notFound } from "next/navigation";
import { getPaymentSessionPublic } from "@/lib/actions/superhote-payment";
import { Logo } from "@/components/app/logo";
import { PaymentForm } from "@/components/app/payment-form";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default async function PublicPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getPaymentSessionPublic(id);
  if (!session) notFound();

  const total = Number(session.price) + Number(session.cleaning) + Number(session.cityTaxes);
  const fmt = (n: number) => (session.devise === "EUR" ? `${n.toLocaleString("fr-FR")} €` : `${n.toLocaleString("fr-FR")} MAD`);

  return (
    <div className="min-h-screen bg-[#f6f6f7] px-4 py-10 dark:bg-[#0b0b0c]">
      <div className="mx-auto w-full max-w-md rounded-lg border border-[#e5e5e5] bg-white dark:border-[#2a2a2d] dark:bg-[#18181b]">
        <div className="flex flex-col items-center gap-3 border-b border-[#ececec] px-8 pb-6 pt-9 dark:border-[#2a2a2d]">
          <Logo size={52} />
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wide text-[#71717a] dark:text-[#9a9aa0]">Paiement sécurisé</p>
            <h1 className="mt-1 text-xl font-semibold text-[#18181b] dark:text-[#f4f4f5]">{session.villaNom}</h1>
          </div>
        </div>

        <div className="space-y-3 px-8 py-6">
          <Row label="Arrivée" value={`${format(new Date(session.dateArrivee), "d MMMM yyyy", { locale: fr })}, 15h00`} />
          <Row label="Départ" value={`${format(new Date(session.dateDepart), "d MMMM yyyy", { locale: fr })}, 11h00`} />
          <Row label="Voyageurs" value={String(session.nbAdultes + session.nbEnfants)} />
          <Row label="Séjour" value={fmt(Number(session.price))} />
          {Number(session.cleaning) > 0 ? <Row label="Ménage" value={fmt(Number(session.cleaning))} /> : null}
          {Number(session.cityTaxes) > 0 ? <Row label="Taxe de séjour" value={fmt(Number(session.cityTaxes))} /> : null}
          <div className="flex items-center justify-between border-t border-[#ececec] pt-3 dark:border-[#2a2a2d]">
            <span className="text-sm font-semibold text-[#18181b] dark:text-[#f4f4f5]">Total</span>
            <span className="text-sm font-semibold text-[#18181b] dark:text-[#f4f4f5]">{fmt(total)}</span>
          </div>
        </div>

        <div className="border-t border-[#ececec] px-8 py-6 dark:border-[#2a2a2d]">
          <PaymentForm
            sessionId={session.id}
            stripePublicKey={session.stripePublicKey}
            statut={session.statut}
            guestPrenom={session.guestPrenom}
          />
        </div>

        <div className="border-t border-[#ececec] px-8 py-4 dark:border-[#2a2a2d]">
          <p className="text-[11px] leading-relaxed text-[#a1a1aa]">Moderna Agency · Marrakech · Paiement traité de façon sécurisée par Stripe.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[#71717a] dark:text-[#9a9aa0]">{label}</span>
      <span className="font-medium text-[#18181b] dark:text-[#f4f4f5]">{value}</span>
    </div>
  );
}
