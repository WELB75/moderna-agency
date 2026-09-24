import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MapPin, Navigation, BookOpen, Wifi, KeyRound, DoorOpen, ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { villas, domaines } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GuestReportForm } from "@/components/app/guest-report-form";
import { toWhatsAppUrl } from "@/lib/phone";

// Page d'accueil client, affichée en QR code dans la villa (voir GuestAccessButton sur
// /villas/[id]) — jeton lienClientToken, distinct du lien propriétaire. Volontairement en
// lecture/écriture minimale : infos pratiques + un seul geste pour signaler un problème, rien
// d'autre (pas de liste de tâches, pas de compte à créer).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BienvenuePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // lienClientToken est une colonne uuid : un token mal formé (lien tronqué, saisie à la main)
  // ferait planter la requête (erreur Postgres 22P02) au lieu d'un simple 404 — filtré ici.
  if (!UUID_RE.test(token)) notFound();
  const db = getDb();

  const [row] = await db
    .select({
      villaNom: villas.nom,
      villaNumero: villas.numero,
      codeWifi: villas.codeWifi,
      codeBoitier: villas.codeBoitier,
      codePorteEntree: villas.codePorteEntree,
      guideBienvenueUrl: villas.guideBienvenueUrl,
      domaineNom: domaines.nom,
      domaineAdresse: domaines.adresse,
      domaineMapsUrl: domaines.mapsUrl,
      domaineWazeUrl: domaines.wazeUrl,
      securitePhone: domaines.securitePhone,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(villas.lienClientToken, token))
    .limit(1);

  if (!row) notFound();

  const codes = [
    { label: "Wifi", value: row.codeWifi, icon: Wifi },
    { label: "Boîtier à clés", value: row.codeBoitier, icon: KeyRound },
    { label: "Porte d'entrée", value: row.codePorteEntree, icon: DoorOpen },
  ].filter((c) => c.value);

  return (
    <div className="mx-auto min-h-screen max-w-xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2 pb-2">
        <Logo size={40} />
        <p className="text-xs text-muted-foreground">Bienvenue</p>
      </div>

      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{row.villaNom}</h1>
        <p className="text-sm text-muted-foreground">
          n°{row.villaNumero}
          {row.domaineNom ? ` · ${row.domaineNom}` : ""}
        </p>
      </div>

      {row.domaineAdresse || row.domaineMapsUrl || row.domaineWazeUrl ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            {row.domaineAdresse ? <p className="text-sm">{row.domaineAdresse}</p> : null}
            <div className="flex flex-wrap gap-2">
              {row.domaineMapsUrl ? (
                <a
                  href={row.domaineMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              ) : null}
              {row.domaineWazeUrl ? (
                <a
                  href={row.domaineWazeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Waze
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {codes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Codes d&apos;accès</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {codes.map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <c.icon className="h-4 w-4" />
                  {c.label}
                </span>
                <span className="font-mono text-sm font-medium">{c.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {row.guideBienvenueUrl ? (
          <a
            href={row.guideBienvenueUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <BookOpen className="h-4 w-4" />
            Guide de bienvenue
          </a>
        ) : null}
        {row.securitePhone ? (
          <a
            href={toWhatsAppUrl(row.securitePhone, `Bonjour, je suis à la ${row.villaNom} (n°${row.villaNumero}).`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            <ShieldCheck className="h-4 w-4" />
            Contacter la sécurité
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signaler un problème</CardTitle>
        </CardHeader>
        <CardContent>
          <GuestReportForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
