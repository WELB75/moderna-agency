import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

export type StayRange = { checkIn: Date; checkOut: Date };

function isBooked(day: Date, stays: StayRange[]) {
  return stays.some((s) => day >= s.checkIn && day < s.checkOut);
}

export function OwnerStayCalendar({
  stays,
  now,
  monthsToShow = 3,
}: {
  stays: StayRange[];
  now: Date;
  monthsToShow?: number;
}) {
  const months = Array.from({ length: monthsToShow }, (_, i) => addMonths(startOfMonth(now), i));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {months.map((month) => {
        const start = startOfMonth(month);
        const end = endOfMonth(month);
        const days = eachDayOfInterval({ start, end });
        // Décalage lundi = 0 : getDay() renvoie 0 pour dimanche, on recale sur une semaine FR.
        const leadingBlanks = (getDay(start) + 6) % 7;

        return (
          <div key={month.toISOString()} className="rounded-lg border p-3">
            <p className="mb-2 text-center text-sm font-semibold capitalize">
              {format(month, "MMMM yyyy", { locale: fr })}
            </p>
            <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] text-muted-foreground">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {days.map((day) => {
                const booked = isBooked(day, stays);
                const today = isSameDay(day, now);
                return (
                  <span
                    key={day.toISOString()}
                    className={cn(
                      "flex h-6 items-center justify-center rounded-full text-[11px] text-foreground",
                      booked && "bg-foreground text-background font-medium",
                      today && "ring-2 ring-offset-2 ring-foreground ring-offset-background",
                      !isSameMonth(day, month) && "opacity-0"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground" />
          Loué
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-offset-2 ring-foreground ring-offset-background" />
          Aujourd&apos;hui
        </span>
      </div>
    </div>
  );
}
