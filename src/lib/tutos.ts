// Tutos pas à pas (onglet "Tutos" + lien public /tuto/[code]) : une frise d'étapes, chacune avec
// une photo et une légende courte, jusqu'à l'état final. Données en dur ici (pas de table) : les
// photos sont dans public/tutos/<slug>/ et on corrige une légende en modifiant ce fichier.
// `brouillon` affiche un bandeau "en cours de vérification" tant que Kamel n'a pas confirmé
// chaque étape (position du sélecteur, vannes, disjoncteur).
export type TutoEtape = { image: string; legende: string; attention?: string };

export type Tuto = {
  slug: string;
  code: string; // code aléatoire du lien public : /tuto/<code>
  titre: string;
  resume: string;
  brouillon: boolean;
  etapes: TutoEtape[];
  fin: string;
};

export const TUTOS: Tuto[] = [
  {
    slug: "chauffage-piscine",
    code: "D340B8guNH1J",
    titre: "Allumer le chauffage de la piscine",
    resume: "Valable pour toutes les villas : 5 étapes, du local technique à la pompe à chaleur.",
    brouillon: true,
    etapes: [
      {
        image: "/tutos/chauffage-piscine/etape-1.jpg",
        legende: "Descendre au local technique et mettre le sélecteur sur OFF.",
      },
      {
        image: "/tutos/chauffage-piscine/etape-2.jpg",
        legende: "Vérifier les vannes : les poignées rouges doivent être dans le sens du tuyau (ouvertes).",
      },
      {
        image: "/tutos/chauffage-piscine/etape-3.jpg",
        legende: "Au tableau électrique, repérer D1 : relever le disjoncteur (le bloc de 4 manettes reliées par une barre noire).",
        attention: "Ne toucher que la barre noire, jamais les fils ni les vis.",
      },
      {
        image: "/tutos/chauffage-piscine/etape-4.jpg",
        legende: "Mettre le sélecteur sur MANUEL, pas sur AUTO.",
      },
      {
        image: "/tutos/chauffage-piscine/etape-5.jpg",
        legende:
          "Sortir du local technique, aller au boîtier de commande de la pompe à chaleur et l'allumer. Vérifier que la température est entre 30 et 40 °C, puis attendre que le ventilateur tourne (30 secondes à 1 minute). Dès qu'il ventile, on peut partir.",
      },
    ],
    fin: "Piscine chauffée",
  },
];

export function tutoParSlug(slug: string): Tuto | undefined {
  return TUTOS.find((t) => t.slug === slug);
}

export function tutoParCode(code: string): Tuto | undefined {
  return TUTOS.find((t) => t.code === code);
}
