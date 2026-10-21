import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Charte Superhosts (2026-10-20) : même police que superhosts.ma, Figtree (voir --font-sans dans
// globals.css). next/font l'héberge avec le site au moment du build : aucune requête vers Google
// Fonts côté visiteur, pas de saut visuel. Geist Mono reste pour le code/mono (--font-mono).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Superhosts",
  description: "Superhosts — gestion des locations : réservations, check-in/check-out, caisse et inventaires",
};

// Titre des écrans Clerk : sans ça, Clerk affiche le nom technique de l'application
// ("Sign in to clerk-sky-button").
const clerkLocalization = {
  signIn: { start: { title: "Sign in to Superhosts" } },
  signUp: { start: { title: "Create your Superhosts account" } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${figtree.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full w-full flex flex-col overflow-x-clip">
        {/* Stripe est clair partout, jamais sombre par défaut — Kamel, 2026-09-08 : "fond clair
            comme stripe" (en réaction au mode sombre pris automatiquement sur un Mac en dark
            mode système). defaultTheme="light" fige le clair tant que l'utilisateur ne bascule
            pas lui-même via le bouton lune/soleil ; enableSystem retiré pour ne plus jamais
            suivre la préférence système. */}
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <ClerkProvider localization={clerkLocalization}>
            {children}
            <Toaster richColors position="top-center" />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
