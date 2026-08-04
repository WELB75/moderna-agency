// Villa Kamel exclue volontairement : c'est une villa de test (Beds24), pas un vrai logement
// réservable — un client ne doit jamais pouvoir tomber dessus.
// Tarifs (prixNuit, EUR/nuit) récupérés depuis le calendrier tarifaire Superhote le 01/08/2026 —
// tarif de base hors variations saisonnières ponctuelles (ex. Villa Lila passe à 690€ certains jours).
// Ni le prix ni la clé Superhote n'existent dans la table `villas` de la base — d'où cette liste
// à part, à tenir à jour manuellement si les tarifs changent.
// ⚠️ Maeva Cosy et Jade Cosy ont été données avec EXACTEMENT la même clé Superhote
// (propertyKey0pXI0iOjB2BSPOSaNv3m4pXF7) — probablement une erreur de copie sur l'une des deux.
// Volontairement laissées sans superhoteId (donc bloquées en dry-run côté Superhote) tant que ce
// n'est pas reconfirmé, pour ne pas risquer de créer une résa sur la mauvaise fiche.
// caution/menage (EUR) confirmés par Kamel le 2026-08-03 : appartements "cosy" 250€/20€ (la
// caution de 250€ ne s'applique qu'aux réservations Direct/Booking.com, jamais Airbnb — non
// pertinent ici puisque l'agent WhatsApp réserve toujours en canal "Direct"). Villas : Gaspard
// 1000€/60€ ; Eline, Azur, Tania, Wimiliim 950€/60€ ; Sofya, Lila 1000€/80€ ; Elysée 950€/80€.
export const VILLAS: { id: string; nom: string; blurb: string; prixNuit: number; caution: number; menage: number; superhoteId?: string }[] = [
  { id: "faa9524c-511c-4c27-bb5e-1f12f37e3e95", nom: "Villa Gaspard", blurb: "n°15, Domaine Moderna II — 4 chambres, piscine privée, jardin", prixNuit: 350, caution: 1000, menage: 60, superhoteId: "propertyKeyIvLAqd512QbZ8SDOBOns9EQVK" },
  { id: "bce855b7-acca-4a4a-a181-fcbb7b5953ee", nom: "Villa Azur", blurb: "n°2, Domaine Zaraba — 8 pers, 4 chambres, hammam, piscine, terrasse, proche Café Del Mar", prixNuit: 350, caution: 950, menage: 60, superhoteId: "propertyKeyxBjhf6IRa6Pi2r9rpGtNdiGFv" },
  { id: "ac5b8ca3-f385-4b30-8430-9d9faaa881cd", nom: "Villa Elysée", blurb: "n°7, Domaine Zaraba — 5 chambres, piscine, jardin, proche Café Del Mar", prixNuit: 550, caution: 950, menage: 80, superhoteId: "propertyKeySkqBUeL4NVNiiYta0vE7Gmb5t" },
  { id: "cdd845b9-d7dd-4380-ace3-22bc0e58dfb2", nom: "Eva cosy", blurb: "n°10, Noria — appart 1 chambre, balcon, résidence 4 piscines", prixNuit: 80, caution: 250, menage: 20, superhoteId: "propertyKeyLq3GM3gOzL42iXlHAq7YKswGX" },
  { id: "bda585e8-4ead-45d2-b12e-16c6125de237", nom: "Mama cosy", blurb: "n°13, Noria — appart 3 pers, 1 chambre, balcon, résidence piscine", prixNuit: 80, caution: 250, menage: 20, superhoteId: "propertyKey13Kq0KepcBseY4lcd40SBsi2W" },
  { id: "236653cb-77be-4fc9-b509-ffc050a93282", nom: "Amal cosy", blurb: "Noria — appart 2 chambres, vue piscine", prixNuit: 110, caution: 250, menage: 20, superhoteId: "propertyKey3HRgu8CAjZvddwIQcUCgWTK6z" },
  { id: "754bcafb-81f9-4f3f-95e1-d0ba9d89bcdf", nom: "Maeva Cosy", blurb: "n°5, Noria", prixNuit: 80, caution: 250, menage: 20, superhoteId: "propertyKey0pXI0iOjB2BSPOSaNv3m4pXF7" },
  { id: "9184e01d-c133-4177-be5b-895efa22cd97", nom: "Jade Cosy", blurb: "Noria", prixNuit: 110, caution: 250, menage: 20, superhoteId: "propertyKeykYV4MDLBbT9EctkUK9fco4J25" },
  { id: "e7df576b-111b-4fcd-874b-c6885a6b95cb", nom: "Villa Tania", blurb: "n°3, Domaine Moderna II — 4 chambres, piscine (sans vis-à-vis), jardin", prixNuit: 350, caution: 950, menage: 60, superhoteId: "propertyKeyLgQVoZhTVRgsRU67zFgqf68fW" },
  { id: "a912b77c-c543-46ba-a021-06233d03752f", nom: "Alba cosy", blurb: "Noria — appart 2 chambres, vue piscine", prixNuit: 110, caution: 250, menage: 20, superhoteId: "propertyKeyvZlzqu6CLuqeBLjVpoFzmvTw1" },
  { id: "acdc1bfe-4f3b-4e5d-8223-1a68131ba66f", nom: "Livia Cosy", blurb: "n°6, Noria", prixNuit: 80, caution: 250, menage: 20, superhoteId: "propertyKeyvkh5gYklaAbYtKCCs8HUeK3f3" },
  { id: "a166d7ad-66a8-439b-b4c3-a1c31f649ed6", nom: "Lina cosy", blurb: "n°5, Noria — appart 1 chambre rez-de-chaussée, jardin privatif", prixNuit: 80, caution: 250, menage: 20, superhoteId: "propertyKeyU6A2rwjqsOeCB6LrDkAY1Jmzq" },
  { id: "37c0fa53-0ac6-4e03-8fe3-6d35dd5209ba", nom: "Villa Eline", blurb: "n°1, Domaine Zaraba — 4 chambres, piscine, jardin, proche Café Del Mar", prixNuit: 350, caution: 950, menage: 60, superhoteId: "propertyKeyftbLy3mSBWe55rw2ckkELBkPW" },
  { id: "f76ca3e6-d3c1-42b2-bb31-ec095c85b69d", nom: "Mya cosy", blurb: "n°10, Noria — appart 1 chambre, balcon", prixNuit: 80, caution: 250, menage: 20, superhoteId: "propertyKeyTtK0Uzjf5mJR5igFNe5TTdlGC" },
  { id: "87f70e37-67fe-42f7-9601-391b525c17f9", nom: "Nina cosy", blurb: "n°1, Noria — appart 1 chambre, terrasse", prixNuit: 70, caution: 250, menage: 20, superhoteId: "propertyKeyEMGaTbQGELu40NUALdwhFuvVo" },
  { id: "8641e2ed-8711-4a3a-8dc8-4b3bd2a9a71f", nom: "Mila Cosy", blurb: "n°1, Noria", prixNuit: 90, caution: 250, menage: 20, superhoteId: "propertyKeyM8BheSj6auVs0VwJFhQlsYVaZ" },
  { id: "016306a5-301c-4efa-b4ad-ed709b40303f", nom: "Villa Lila", blurb: "n°14, Domaine Moderna II — 5 chambres, jusqu'à 10 pers, hammam + salle de sport privés, piscine chauffée", prixNuit: 650, caution: 1000, menage: 80, superhoteId: "propertyKeybMJXo1lOvdBtZ0JUw4sUr5Zyk" },
  { id: "ea6cd59d-287b-41f8-8d4f-aa147b93d083", nom: "Villa Wimiliim", blurb: "n°16, Domaine Moderna II — 4 chambres, piscine (sans vis-à-vis), jardin", prixNuit: 350, caution: 950, menage: 60, superhoteId: "propertyKeyEizrWAA0gVu9W19raPXvMf4xR" },
  { id: "bf33c8ba-2f65-4a09-bedd-870646fcdd08", nom: "Villa Sofya", blurb: "n°13, Domaine Moderna II — 5 chambres, jusqu'à 10 pers, mobilier Roche Bobois, cuisinière incluse, barbecue, piscine chauffée", prixNuit: 650, caution: 1000, menage: 80, superhoteId: "propertyKeyKOO2kUkhcSqDaTiwuRRFOV8Yy" },
];

