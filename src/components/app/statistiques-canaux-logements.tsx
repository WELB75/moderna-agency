import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SOURCE_META, type CanalKey } from "@/lib/canal";

export type CanalStats = { resas: number; nuitees: number; ca: number };

export type LogementAnneeStats = {
  villaId: string;
  nom: string;
  nuitees: number;
  nuitsDisponibles: number;
  resas: number;
  ca: number;
  canaux: Record<CanalKey, { nuitees: number; ca: number }>;
};

// Airbnb / Booking.com / En direct d'abord (demande de Kamel), le reste regroupé après.
const CANAUX_AFFICHES: CanalKey[] = ["airbnb", "booking", "direct", "autre", "bloque"];
const CANAUX_COLONNES: CanalKey[] = ["airbnb", "booking", "direct"];

function euros(value: number): string {
  return value === 0 ? "–" : `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function pourcent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : "–";
}

export function StatistiquesCanauxLogements({
  year,
  parCanal,
  logements,
}: {
  year: number;
  parCanal: Record<CanalKey, CanalStats>;
  logements: LogementAnneeStats[];
}) {
  const canaux = CANAUX_AFFICHES.filter((c) => CANAUX_COLONNES.includes(c) || parCanal[c].nuitees > 0);
  const totalCa = canaux.reduce((s, c) => s + parCanal[c].ca, 0);
  const totalNuitees = canaux.reduce((s, c) => s + parCanal[c].nuitees, 0);
  const totalResas = canaux.reduce((s, c) => s + parCanal[c].resas, 0);
  const autreColonne = logements.some((l) => l.canaux.autre.nuitees > 0 || l.canaux.bloque.nuitees > 0);
  const colonnes: CanalKey[] = autreColonne ? [...CANAUX_COLONNES, "autre"] : CANAUX_COLONNES;
  const lignes = [...logements].sort((a, b) => b.ca - a.ca || b.nuitees - a.nuitees);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Par canal</CardTitle>
          <CardDescription>Airbnb, Booking.com et en direct, {year}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Réservations</TableHead>
                <TableHead className="text-right">Nuitées</TableHead>
                <TableHead className="text-right">Part des nuitées</TableHead>
                <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                <TableHead className="text-right">Part du CA</TableHead>
                <TableHead className="text-right">CA / nuit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {canaux.map((c) => {
                const s = parCanal[c];
                return (
                  <TableRow key={c}>
                    <TableCell className="font-medium">
                      <span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: SOURCE_META[c].brand }} />
                      {SOURCE_META[c].label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.resas || "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.nuitees || "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pourcent(s.nuitees, totalNuitees)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euros(s.ca)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pourcent(s.ca, totalCa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.nuitees > 0 ? euros(s.ca / s.nuitees) : "–"}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 font-medium">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{totalResas || "–"}</TableCell>
                <TableCell className="text-right tabular-nums">{totalNuitees || "–"}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{euros(totalCa)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{totalNuitees > 0 ? euros(totalCa / totalNuitees) : "–"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Par logement</CardTitle>
          <CardDescription>Total {year} et chiffre d&apos;affaires par canal, du plus élevé au plus bas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hébergement</TableHead>
                <TableHead className="text-right">Réservations</TableHead>
                <TableHead className="text-right">Nuitées</TableHead>
                <TableHead className="text-right">Occupation</TableHead>
                <TableHead className="text-right">CA</TableHead>
                <TableHead className="text-right">CA / nuit</TableHead>
                {colonnes.map((c) => (
                  <TableHead key={c} className="text-right">
                    {SOURCE_META[c].label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6 + colonnes.length} className="py-6 text-center text-muted-foreground">
                    Aucun logement dans ce périmètre.
                  </TableCell>
                </TableRow>
              ) : null}
              {lignes.map((l) => {
                const autre = l.canaux.autre.ca + l.canaux.bloque.ca;
                return (
                  <TableRow key={l.villaId}>
                    <TableCell className="font-medium">
                      <Link href={`/villas/${l.villaId}`} className="hover:underline">
                        {l.nom}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.resas || "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.nuitees || "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pourcent(l.nuitees, l.nuitsDisponibles)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euros(l.ca)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.nuitees > 0 ? euros(l.ca / l.nuitees) : "–"}</TableCell>
                    {colonnes.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums">
                        {euros(c === "autre" ? autre : l.canaux[c].ca)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
