import { test } from "node:test";
import assert from "node:assert/strict";
import { aujourdhuiMaroc, sejourEntierementPasse, sejourEstTermine } from "./reservation-passee.ts";

const MAINTENANT = new Date("2026-11-24T10:30:00Z");

test("réservation passée : le jour est celui du Maroc", () => {
  assert.equal(aujourdhuiMaroc(MAINTENANT), "2026-11-24");
  // 23h30 UTC = minuit 30 le lendemain au Maroc (UTC+1)
  assert.equal(aujourdhuiMaroc(new Date("2026-11-24T23:30:00Z")), "2026-11-25");
});

test("réservation passée : séjour terminé = départ aujourd'hui ou avant", () => {
  assert.equal(sejourEstTermine("2026-11-11T11:00", MAINTENANT), true);
  assert.equal(sejourEstTermine("2026-11-24T11:00", MAINTENANT), true);
  assert.equal(sejourEstTermine("2026-11-25T11:00", MAINTENANT), false);
});

test("réservation passée : sans l'option, refusé seulement si le départ est avant aujourd'hui", () => {
  assert.equal(sejourEntierementPasse("2026-11-11T11:00", MAINTENANT), true);
  assert.equal(sejourEntierementPasse("2026-11-24T11:00", MAINTENANT), false);
  assert.equal(sejourEntierementPasse("2026-12-01T11:00", MAINTENANT), false);
});
