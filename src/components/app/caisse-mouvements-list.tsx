"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { deleteCashEntry } from "@/lib/actions/caisse";
import { cn } from "@/lib/utils";
import { CATEGORIE_LABELS, TYPE_LABELS, CAISSE_LABELS, type Entry } from "@/lib/caisse-labels";

export function CaisseMouvementsList({ entries }: { entries: Entry[] }) {
  const [categorieFiltre, setCategorieFiltre] = useState("toutes");

  const categoriesPresentes = useMemo(
    () => Array.from(new Set(entries.filter((e) => e.categorie).map((e) => e.categorie!))),
    [entries]
  );

  const entriesFiltrees = useMemo(() => {
    if (categorieFiltre === "toutes") return entries;
    return entries.filter((e) => e.categorie === categorieFiltre);
  }, [entries, categorieFiltre]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Mouvements</CardTitle>
        {categoriesPresentes.length > 0 ? (
          <Select value={categorieFiltre} onValueChange={setCategorieFiltre}>
            <SelectTrigger className="w-[220px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes les dépenses</SelectItem>
              {categoriesPresentes.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORIE_LABELS[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {entriesFiltrees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
        ) : (
          entriesFiltrees.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={e.type === "remise" || e.type === "loyer" || e.type === "extra" ? "secondary" : "outline"}
                    className={cn(
                      e.type === "loyer" && "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
                      e.type === "extra" && "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                    )}
                  >
                    {TYPE_LABELS[e.type]}
                  </Badge>
                  {e.categorie ? (
                    <Badge variant="outline" className="border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300">
                      {CATEGORIE_LABELS[e.categorie] ?? e.categorie}
                    </Badge>
                  ) : null}
                  {e.caisse === "brahim" ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      Caisse {CAISSE_LABELS[e.caisse] ?? e.caisse}
                    </Badge>
                  ) : null}
                  {e.type === "depense" && e.financePar === "loyers_perso" ? (
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      Payé avec mes loyers
                    </Badge>
                  ) : null}
                  <span className="font-semibold">
                    {e.type === "remise" || e.type === "loyer" || e.type === "extra" ? "+" : "-"}
                    {Number(e.montant).toFixed(2)} {e.devise}
                  </span>
                </div>
                {e.description ? <p className="mt-1 text-sm">{e.description}</p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {e.domaineNom ? <DomaineBadge nom={e.domaineNom} className="text-xs" /> : null}
                  {e.villaNom ? (
                    <span className="text-xs text-muted-foreground">
                      {e.villaNom} (n°{e.villaNumero})
                    </span>
                  ) : null}
                  {e.responsable ? (
                    <span className="text-xs text-muted-foreground">· {e.responsable}</span>
                  ) : null}
                  {e.guestName ? (
                    <span className="text-xs font-medium text-foreground">· Client : {e.guestName}</span>
                  ) : e.type !== "remise" ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">· Client non lié</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ajouté par {e.createdByName ?? "Équipe"} ·{" "}
                  {format(new Date(e.createdAt), "d MMM yyyy HH:mm", { locale: fr })}
                </p>
                {e.photoUrls && e.photoUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.photoUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="relative h-16 w-16 overflow-hidden rounded-md border">
                        <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <ConfirmDeleteButton
                action={deleteCashEntry.bind(null, e.id)}
                title="Supprimer ce mouvement ?"
                description="Cette action est irréversible."
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
