import { test } from "node:test";
import assert from "node:assert/strict";
import { idPrincipal, trouverUtilisateur } from "./utilisateurs.ts";

const ENV = "111, 9208341954:Fouad";

test("utilisateurs Telegram : le premier est Kamel, le principal", () => {
  const u = trouverUtilisateur("111", "K", ENV);
  assert.deepEqual(u, { id: "111", nom: "Kamel", principal: true, auteurId: "telegram-agent" });
});

test("utilisateurs Telegram : Fouad a son nom et son propre auteur de caisse", () => {
  const u = trouverUtilisateur("9208341954", "Autre", ENV);
  assert.deepEqual(u, { id: "9208341954", nom: "Fouad", principal: false, auteurId: "telegram-agent:9208341954" });
});

test("utilisateurs Telegram : sans prénom configuré, prénom Telegram", () => {
  assert.equal(trouverUtilisateur("222", "Sara", "111,222")?.nom, "Sara");
});

test("utilisateurs Telegram : inconnu ou liste vide refusés", () => {
  assert.equal(trouverUtilisateur("333", "X", ENV), null);
  assert.equal(trouverUtilisateur("111", "K", undefined), null);
});

test("utilisateurs Telegram : un seul identifiant (ancien format) reste valide", () => {
  assert.equal(trouverUtilisateur("111", null, "111")?.principal, true);
  assert.equal(idPrincipal("111"), "111");
  assert.equal(idPrincipal(ENV), "111");
});
