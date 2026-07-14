export type IcalEvent = {
  uid: string;
  summary: string | null;
  start: Date;
  end: Date;
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
  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const dateTimeMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (dateTimeMatch) {
    const [, y, mo, d, h, mi, s, z] = dateTimeMatch;
    if (z) {
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    }
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }
  // YYYYMMDD (all-day / date-only)
  const dateOnlyMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, mo, d] = dateOnlyMatch;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  }
  return null;
}

function unescapeIcsText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

export function parseIcs(raw: string): IcalEvent[] {
  const lines = unfoldLines(raw);
  const events: IcalEvent[] = [];

  let current: Partial<Record<"UID" | "SUMMARY" | "DTSTART" | "DTEND", string>> | null = null;

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
          events.push({
            uid: current.UID?.trim() || `${current.DTSTART}-${current.DTEND}`,
            summary: current.SUMMARY ? unescapeIcsText(current.SUMMARY.trim()) : null,
            start,
            end,
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
  }

  return events;
}
