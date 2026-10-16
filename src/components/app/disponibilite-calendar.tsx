"use client";

import { useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { getDefaultClassNames } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";

// Calendrier d'arrivée / départ branché sur la disponibilité réelle du logement : les nuits déjà
// prises sont barrées et ne peuvent pas être choisies, un séjour qui en traverserait une est
// refusé. Le jour du départ peut tomber sur une nuit prise (turnover le même jour).
// Kamel, 2026-10-14 : "si on choisit une date et que c'est pas dispo ça sera impossible à réserver".

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const parse = (s: string) => new Date(`${s}T00:00:00`);

export function DisponibiliteCalendar({
  nuitsPrises,
  arrivee,
  depart,
  onChange,
}: {
  nuitsPrises: Set<string>;
  arrivee: string;
  depart: string;
  onChange: (arrivee: string, depart: string) => void;
}) {
  const [mois, setMois] = useState<Date>(() => (arrivee ? parse(arrivee) : new Date()));
  const aujourdhui = startOfDay(new Date());

  const prises = useMemo(() => Array.from(nuitsPrises).map(parse), [nuitsPrises]);
  const from = arrivee ? parse(arrivee) : undefined;
  const to = depart ? parse(depart) : undefined;

  function nuitsLibresEntre(a: string, d: string): boolean {
    for (let c = parse(a); iso(c) < d; c = addDays(c, 1)) {
      if (nuitsPrises.has(iso(c))) return false;
    }
    return true;
  }

  function choisir(jour: Date) {
    const j = iso(jour);
    if (jour < aujourdhui) return;
    // 1er clic (ou nouveau départ après un séjour complet) : arrivée.
    if (!arrivee || depart || j <= arrivee) {
      if (nuitsPrises.has(j)) {
        toast.error("Cette nuit n'est pas disponible.");
        return;
      }
      onChange(j, "");
      return;
    }
    // 2e clic : départ — toutes les nuits entre l'arrivée et ce jour doivent être libres.
    if (!nuitsLibresEntre(arrivee, j)) {
      toast.error("Une nuit de ce séjour est déjà prise : choisis un départ plus tôt ou une autre arrivée.");
      return;
    }
    onChange(arrivee, j);
  }

  const nuits = arrivee && depart ? Math.round((parse(depart).getTime() - parse(arrivee).getTime()) / 86400000) : 0;

  return (
    <div className="space-y-2">
      <Calendar
        locale={fr}
        month={mois}
        onMonthChange={setMois}
        numberOfMonths={1}
        weekStartsOn={1}
        onDayClick={choisir}
        disabled={{ before: aujourdhui }}
        modifiers={{
          prise: prises,
          arrivee: from ? [from] : [],
          depart: to ? [to] : [],
          sejour: from && to ? [{ after: from, before: to }] : [],
        }}
        modifiersClassNames={{
          prise: "[&>button]:bg-muted [&>button]:text-muted-foreground [&>button]:line-through [&>button]:opacity-60",
          arrivee: "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!opacity-100",
          depart: "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!opacity-100",
          sejour: "[&>button]:!bg-primary/20 [&>button]:!opacity-100",
        }}
        classNames={{ root: `${getDefaultClassNames().root} w-full md:w-fit` }}
        className="w-full rounded-lg border [--cell-size:--spacing(11)] md:w-fit md:[--cell-size:--spacing(7)]"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-muted line-through opacity-60" /> Nuit déjà prise
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> Votre séjour
        </span>
      </div>
      <p className="text-sm">
        {arrivee && depart
          ? `${format(parse(arrivee), "EEE d MMM", { locale: fr })} → ${format(parse(depart), "EEE d MMM", { locale: fr })} · ${nuits} nuit${nuits > 1 ? "s" : ""}`
          : arrivee
            ? `Arrivée le ${format(parse(arrivee), "EEE d MMM", { locale: fr })} — choisis maintenant le départ.`
            : "Choisis la date d'arrivée."}
      </p>
    </div>
  );
}
