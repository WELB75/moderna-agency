import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Charte façon Stripe (Kamel, 2026-09-08 : "je veux le meme design ui ux que stripe [...]
// couleurs, police, interface, animation etc") — polices SYSTÈME pour le texte (voir --font-sans
// dans globals.css, calqué sur docs.stripe.com), plus aucune police à charger depuis Google
// Fonts : chargement instantané, sans saut visuel ni requête réseau. Geist Mono reste pour le
// code/mono (--font-mono).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Moderna Agency",
  description: "Gestion des villas : check-in/check-out, caisse et inventaires",
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
      className={`${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full w-full flex flex-col overflow-x-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ClerkProvider>
            {children}
            <Toaster richColors position="top-center" />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
