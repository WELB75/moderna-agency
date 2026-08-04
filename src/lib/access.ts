import { currentUser } from "@clerk/nextjs/server";

// Certaines pages (ex. Agent IA) ne doivent être visibles que par Kamel — pas par Imane, qui a
// pourtant le même accès Clerk basique au reste de l'app. Pas de vrai système de rôles pour
// l'instant, donc restriction par email en dur plutôt qu'un flag "admin" à gérer.
const KAMEL_EMAIL = "tmshparis@gmail.com";

export async function isKamel(): Promise<boolean> {
  const user = await currentUser();
  return user?.emailAddresses.some((e) => e.emailAddress.toLowerCase() === KAMEL_EMAIL) ?? false;
}
