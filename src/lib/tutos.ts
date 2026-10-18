// Tutos pas à pas (onglet "Tutos" + lien public /tuto/[code]) : une frise d'étapes, chacune avec
// une photo et une légende courte, jusqu'à l'état final. Données en dur ici (pas de table) : les
// photos sont dans public/tutos/<slug>/ et on corrige une légende en modifiant ce fichier.
// `brouillon` affiche un bandeau "en cours de vérification" tant que Kamel n'a pas confirmé
// chaque étape (position du sélecteur, vannes, disjoncteur).
// repere : cercle rouge posé sur la photo, en % de l'image (x/y = coin haut-gauche), pour montrer
// du doigt l'élément à toucher.
export type TutoRepere = { x: number; y: number; w: number; h: number };
export type TutoImage = { src: string; titre?: string; repere?: TutoRepere };
export type TutoEtape = { images: TutoImage[]; legende: string; attention?: string };

export type Tuto = {
  slug: string;
  code: string; // code aléatoire du lien public : /tuto/<code>
  titre: string;
  resume: string;
  brouillon: boolean;
  etapes: TutoEtape[];
  fin: string;
  rappel?: string; // affiché sur l'écran de fin
};

export const TUTOS: Tuto[] = [
  {
    slug: "chauffage-piscine",
    code: "D340B8guNH1J",
    titre: "Allumer le chauffage de la piscine",
    resume: "Valable pour toutes les villas : 5 étapes, du local technique à la pompe à chaleur.",
    brouillon: false,
    etapes: [
      {
        images: [{ src: "/tutos/chauffage-piscine/etape-1.jpg", repere: { x: 46, y: 43.5, w: 11, h: 5 } }],
        legende: "Descendre au local technique et mettre le sélecteur sur COM (position du milieu).",
      },
      {
        images: [{ src: "/tutos/chauffage-piscine/etape-2.jpg" }],
        legende: "Vérifier les vannes : les poignées rouges doivent être dans le sens du tuyau (ouvertes).",
      },
      {
        images: [
          { src: "/tutos/chauffage-piscine/etape-3-ensemble.jpg", titre: "Vue d'ensemble du tableau", repere: { x: 72, y: 15, w: 16.5, h: 13.5 } },
          { src: "/tutos/chauffage-piscine/etape-3.jpg", titre: "Zoom" },
        ],
        legende: "Au tableau électrique, repérer D2 : relever le disjoncteur (le bloc de 4 manettes reliées par une barre noire).",
        attention: "Ne toucher que la barre noire, jamais les fils ni les vis.",
      },
      {
        images: [{ src: "/tutos/chauffage-piscine/etape-4.jpg", repere: { x: 32.5, y: 43.5, w: 13, h: 5 } }],
        legende: "Mettre le sélecteur sur MANUEL, pas sur AUTO.",
        attention: "Pour chauffer la piscine, c'est toujours sur MANUEL.",
      },
      {
        images: [{ src: "/tutos/chauffage-piscine/etape-5.jpg" }],
        legende:
          "Sortir du local technique, aller au boîtier de commande de la pompe à chaleur et l'allumer. Vérifier que la température est entre 30 et 40 °C, puis attendre que le ventilateur tourne (30 secondes à 1 minute). Dès qu'il ventile, on peut partir.",
      },
    ],
    fin: "Piscine chauffée",
    rappel: "Pour chauffer la piscine, le sélecteur reste toujours sur MANUEL.",
  },
];

export function tutoParSlug(slug: string): Tuto | undefined {
  return TUTOS.find((t) => t.slug === slug);
}

export function tutoParCode(code: string): Tuto | undefined {
  return TUTOS.find((t) => t.code === code);
}
