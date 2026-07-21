import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { nowInMorocco } from "@/lib/now";
import { EditReservationTimeDialog } from "@/components/app/edit-reservation-time-dialog";

export function ReservationDates({
  checkIn,
  checkOut,
  reservationId,
}: {
  checkIn: Date;
  checkOut: Date;
  reservationId?: string;
}) {
  const now = nowInMorocco();
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <DateBlock kind="in" date={checkIn} isToday={isSameDay(checkIn, now)} />
        <DateBlock kind="out" date={checkOut} isToday={isSameDay(checkOut, now)} />
      </div>
      {reservationId ? (
        <div className="flex justify-end">
          <EditReservationTimeDialog reservationId={reservationId} checkIn={checkIn} checkOut={checkOut} />
        </div>
      ) : null}
    </div>
  );
}

function DateBlock({ kind, date, isToday }: { kind: "in" | "out"; date: Date; isToday: boolean }) {
  const isIn = kind === "in";
  return (
    <div
      className={
        "flex items-center gap-2 rounded-md border p-2 " +
        (isIn ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")
      }
    >
      <div
        className={
          "shrink-0 rounded-full p-1.5 " +
          (isIn
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-red-500/15 text-red-600 dark:text-red-400")
        }
      >
        {isIn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p
            className={
              "text-xs font-semibold uppercase tracking-wide " +
              (isIn ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")
            }
          >
            {isIn ? "Check-in" : "Check-out"}
          </p>
          {isToday && <Badge className={isIn ? "bg-emerald-600" : "bg-red-600"}>Aujourd&apos;hui</Badge>}
        </div>
        <p className="truncate text-sm font-bold">
          {format(date, "EEEE d MMM yyyy", { locale: fr })} · {format(date, "HH:mm", { locale: fr })}
        </p>
      </div>
    </div>
  );
}
