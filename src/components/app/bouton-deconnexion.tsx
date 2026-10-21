"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Bouton "Se déconnecter" de la page /acces-refuse : permet de revenir à l'écran de connexion
// avec un autre compte (celui de l'équipe).
export function BoutonDeconnexion({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const { signOut } = useClerk();
  const [enCours, setEnCours] = useState(false);
  return (
    <Button
      variant={variant}
      disabled={enCours}
      onClick={() => {
        setEnCours(true);
        void signOut({ redirectUrl: "/sign-in" });
      }}
    >
      <LogOut className="h-4 w-4" />
      {enCours ? "Déconnexion…" : "Se déconnecter / changer de compte"}
    </Button>
  );
}
