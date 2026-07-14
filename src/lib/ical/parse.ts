export type SuperhoteDescriptionInfo = {
  arriving: Date | null;
  departing: Date | null;
  nbAdultes: number | null;
  nbEnfants: number | null;
  guestEmail: string | null;
  guestPhone: string | null;
  rentalName: string | null;
};

export type IcalEvent = {
  uid: string;
  summary: string | null;
  guestName: string | null;
  canal: string | null;
  start: Date;
  end: Date;
  description: SuperhoteDescriptionInfo;
};

function unfoldLines(raw: string): string[] {
  const rawLines = raw.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): Date | null {
  const trimmed = value.trim();
  const dateTimeMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (dateTimeMatch) {
    const [, y, mo, d, h, mi, s, z] = dateTimeMatch;
    if (z) {
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    }
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }
  const dateOnlyMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, mo, d] = dateOnlyMatch;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  }
  return null;
}

function unescapeIcsText(value: string, preserveNewlines = false): string {
  return value
    .replace(/\\n/gi, preserveNewlines ? "\n" : " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

// "13 May 2026 14:00" -> Date (l'heure est parfois absente : "02 August 2026")
function parseSuperhoteDateTime(value: string, defaultHour: number, defaultMinute: number): Date | null {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  const [, day, monthName, year, hour, minute] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined) return null;
  const h = hour !== undefined ? Number(hour) : defaultHour;
  const mi = minute !== undefined ? Number(minute) : defaultMinute;
  return new Date(Number(year), month, Number(day), h, mi);
}

function parseSuperhoteDescription(description: string): SuperhoteDescriptionInfo {
  const info: SuperhoteDescriptionInfo = {
    arriving: null,
    departing: null,
    nbAdultes: null,
    nbEnfants: null,
    guestEmail: null,
    guestPhone: null,
    rentalName: null,
  };

  for (const line of description.split("\n")) {
    const [rawKey, ...rest] = line.split(" - ");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(" - ").trim();
    if (!value) continue;

    if (key === "arriving") info.arriving = parseSuperhoteDateTime(value, 14, 0);
    else if (key === "departing") info.departing = parseSuperhoteDateTime(value, 11, 0);
    else if (key === "number of adults") info.nbAdultes = Number.isFinite(Number(value)) ? Number(value) : null;
    else if (key === "number of children") info.nbEnfants = Number.isFinite(Number(value)) ? Number(value) : null;
    else if (key === "guest email") info.guestEmail = value;
    else if (key === "guest phone") info.guestPhone = value;
    else if (key === "rental name") info.rentalName = value;
  }

  return info;
}

export function parseIcs(raw: string): IcalEvent[] {
  const lines = unfoldLines(raw);
  const events: IcalEvent[] = [];

  let current: Partial<Record<"UID" | "SUMMARY" | "DTSTART" | "DTEND" | "DESCRIPTION", string>> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (current?.DTSTART && current?.DTEND) {
        const start = parseIcsDate(current.DTSTART);
        const end = parseIcsDate(current.DTEND);
        if (start && end) {
          const summary = current.SUMMARY ? unescapeIcsText(current.SUMMARY.trim()) : null;
          const descriptionRaw = current.DESCRIPTION ? unescapeIcsText(current.DESCRIPTION.trim(), true) : "";
          const description = parseSuperhoteDescription(descriptionRaw);

          // SUMMARY format observé : "GuestName - Canal - BookingId"
          const summaryParts = summary ? summary.split(" - ") : [];
          const guestName = summaryParts.length > 0 ? summaryParts[0].trim() : null;
          const canal = summaryParts.length > 1 ? summaryParts[1].trim() : null;

          events.push({
            uid: current.UID?.trim() || `${current.DTSTART}-${current.DTEND}`,
            summary,
            guestName,
            canal,
            start: description.arriving ?? start,
            end: description.departing ?? end,
            description,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const rawKey = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const key = rawKey.split(";")[0].toUpperCase();

    if (key === "UID") current.UID = value;
    else if (key === "SUMMARY") current.SUMMARY = value;
    else if (key === "DTSTART") current.DTSTART = value;
    else if (key === "DTEND") current.DTEND = value;
    else if (key === "DESCRIPTION") current.DESCRIPTION = value;
  }

  return events;
}
