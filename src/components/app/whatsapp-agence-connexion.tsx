"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enregistrerConnexionWhatsAppAgence, relancerImportHistoriqueAgence } from "@/lib/actions/whatsapp-agence-connexion";

// Bouton "Inscription intégrée" de Meta en mode coexistence : la personne connectée à Facebook
// (administrateur de l'app Meta "Moderna IA") choisit le compte WhatsApp Moderna Agency, puis un
// QR code s'affiche ; il est scanné avec l'application WhatsApp Business du téléphone de l'agence.
// Le téléphone continue de fonctionner normalement, l'app reçoit une copie de tout.

type FB = {
  init: (o: Record<string, unknown>) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

function chargerSdk(appId: string): Promise<FB> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v25.0" });
      resolve(window.FB!);
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/fr_FR/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Impossible de charger le module de connexion Meta."));
    document.body.appendChild(s);
  });
}

type Session = { phoneNumberId: string; wabaId: string | null };

function messageLisible(err: unknown, parDefaut: string): string {
  if (!(err instanceof Error) || err.message.includes("Server Components render")) return parDefaut;
  return err.message;
}

export function WhatsAppAgenceConnexion({
  appId,
  configId,
  dejaConnecte,
}: {
  appId: string;
  configId: string;
  dejaConnecte: boolean;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState<"pret" | "en_cours" | "enregistrement">("pret");
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const code = useRef<string | null | undefined>(undefined); // undefined = pas encore reçu
  const session = useRef<Session | null>(null);

  const finaliser = useCallback(() => {
    if (!session.current || code.current === undefined) return;
    const s = session.current;
    const c = code.current;
    session.current = null;
    code.current = undefined;
    setEtape("enregistrement");
    startTransition(async () => {
      try {
        const r = await enregistrerConnexionWhatsAppAgence({ code: c, phoneNumberId: s.phoneNumberId, wabaId: s.wabaId });
        setAvertissements(r.avertissements);
        toast.success(r.numero ? `Ligne ${r.numero} connectée.` : "Ligne WhatsApp de l'agence connectée.");
        router.refresh();
      } catch (err) {
        setErreur(messageLisible(err, "La connexion n'a pas pu être enregistrée."));
      } finally {
        setEtape("pret");
      }
    });
  }, [router]);

  // Meta envoie le résultat du parcours (identifiants du numéro et du compte) par postMessage.
  useEffect(() => {
    function surMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let data: { type?: string; event?: string; data?: Record<string, string> } | null = null;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        const phoneNumberId = data.data?.phone_number_id;
        if (phoneNumberId) {
          session.current = { phoneNumberId, wabaId: data.data?.waba_id ?? null };
          finaliser();
        }
      } else if (data.event === "CANCEL") {
        setEtape("pret");
        setErreur(data.data?.error_message ?? "Connexion interrompue avant la fin.");
      } else if (data.event === "ERROR") {
        setEtape("pret");
        setErreur(data.data?.error_message ?? "Meta a renvoyé une erreur.");
      }
    }
    window.addEventListener("message", surMessage);
    return () => window.removeEventListener("message", surMessage);
  }, [finaliser]);

  async function lancer() {
    setErreur(null);
    setAvertissements([]);
    setEtape("en_cours");
    try {
      const fb = await chargerSdk(appId);
      fb.login(
        (r) => {
          if (r.authResponse?.code) {
            code.current = r.authResponse.code;
            finaliser();
          } else if (!session.current) {
            // Fenêtre fermée sans aller au bout.
            code.current = undefined;
            setEtape("pret");
          } else {
            code.current = null;
            finaliser();
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
        }
      );
    } catch (err) {
      setEtape("pret");
      setErreur(messageLisible(err, "Impossible d'ouvrir la connexion Meta."));
    }
  }

  function relancer() {
    startTransition(async () => {
      try {
        const { erreur: e } = await relancerImportHistoriqueAgence();
        if (e) setErreur(e);
        else toast.success("Import des contacts et de l'historique demandé à Meta.");
        router.refresh();
      } catch (err) {
        setErreur(messageLisible(err, "Relance impossible."));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={lancer} disabled={etape !== "pret" || isPending}>
          {etape === "en_cours"
            ? "Connexion en cours…"
            : etape === "enregistrement"
              ? "Enregistrement…"
              : dejaConnecte
                ? "Reconnecter la ligne"
                : "Connecter la ligne WhatsApp de l'agence"}
        </Button>
        {dejaConnecte ? (
          <Button variant="outline" onClick={relancer} disabled={isPending || etape !== "pret"}>
            Relancer l&apos;import de l&apos;historique
          </Button>
        ) : null}
      </div>
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : null}
      {avertissements.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {avertissements.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
