import { test } from "node:test";
import assert from "node:assert/strict";
import { buildArrivalMessage } from "./message-templates.ts";

const arrivee = new Date("2026-11-08T15:00:00Z");
const now = new Date("2026-11-03T10:00:00Z");

test("appartement : pas de cuisinière, ni villa ni domaine", () => {
  for (const lang of ["fr", "en"] as const) {
    const m = buildArrivalMessage("Abir", arrivee, now, "https://x/g/1", lang, false, true);
    assert.doesNotMatch(m, /cuisini|cook|villa|domain|domaine/i);
    assert.match(m, /appartement|apartment/);
  }
});

test("villa : cuisinière toujours proposée", () => {
  const m = buildArrivalMessage("Abir", arrivee, now, "https://x/g/1", "fr", false, false);
  assert.match(m, /cuisinière/);
  assert.match(m, /à la villa/);
});
