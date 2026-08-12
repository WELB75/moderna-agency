"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { Bell, Phone, CalendarClock, Wrench, CheckCircle2, Camera, Loader2, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { InterventionAttachments } from "@/components/app/intervention-attachments";
import { UrgenceBadge } from "@/components/app/urgence-badge";
import {
  setInterventionEtapeByTechnician,
  addInterventionAttachmentsByTechnician,
} from "@/lib/actions/interventions";
import { cn } from "@/lib/utils";
import type { Etape } from "@/lib/intervention-steps";
import type { Urgence } from "@/lib/intervention-urgence";

const STEPS: { key: Etape; label: string; labelAr: string; icon: typeof Bell }[] = [
  { key: "signale", label: "Signalé", labelAr: "تم الإبلاغ", icon: Bell },
  { key: "contacte", label: "Contacté", labelAr: "تم الاتصال", icon: Phone },
  { key: "planifie", label: "Planifié", labelAr: "مبرمج", icon: CalendarClock },
  { key: "en_cours", label: "En cours", labelAr: "جاري العمل", icon: Wrench },
  { key: "termine", label: "Terminé", labelAr: "تم الإنجاز", icon: CheckCircle2 },
];

export type TechnicianInterventionData = {
  id: string;
  titre: string;
  probleme: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  domaineMapsUrl: string | null;
  urgence: Urgence;
  etape: Etape;
  attachmentUrls: string[] | null;
};

export function TechnicianInterventionCard({
  token,
  intervention,
}: {
  token: string;
  intervention: TechnicianInterventionData;
}) {
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentIndex = STEPS.findIndex((s) => s.key === intervention.etape);

  function handleStepTap(key: Etape) {
    if (key === intervention.etape) return;
    startTransition(async () => {
      try {
        await setInterventionEtapeByTechnician(token, intervention.id, key);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur / خطأ");
      }
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const blob = await upload(`interventions/${intervention.id}/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          clientPayload: token,
        });
        uploaded.push(blob.url);
      }
      await addInterventionAttachmentsByTechnician(token, intervention.id, uploaded);
      toast.success("Photo ajoutée / تمت إضافة الصورة");
    } catch {
      toast.error("Échec de l'envoi / فشل الإرسال");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className={cn(intervention.etape === "termine" && "border-emerald-500/30")}>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <UrgenceBadge urgence={intervention.urgence} />
          {intervention.domaineMapsUrl ? (
            <a
              href={intervention.domaineMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
            >
              <MapPin className="h-3 w-3" />
              Carte / الخريطة
            </a>
          ) : null}
        </div>

        <div>
          <h3 className="break-words text-lg font-bold uppercase tracking-wide">{intervention.titre}</h3>
          <p className="text-sm text-muted-foreground">
            {intervention.villaNom ? `${intervention.villaNom} (n°${intervention.villaNumero})` : ""}
            {intervention.domaineNom ? ` · ${intervention.domaineNom}` : ""}
          </p>
        </div>

        {intervention.probleme ? <p className="text-sm">{intervention.probleme}</p> : null}

        <InterventionAttachments urls={intervention.attachmentUrls ?? []} />

        <div className="grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === currentIndex;
            const done = i < currentIndex;
            return (
              <button
                key={s.key}
                type="button"
                disabled={isPending}
                onClick={() => handleStepTap(s.key)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors",
                  active && "border-primary bg-primary/10",
                  done && !active && "border-emerald-500/40 bg-emerald-500/5",
                  !active && !done && "border-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    active ? "text-primary" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                />
                <span className="text-[9px] font-medium leading-tight">{s.label}</span>
                <span className="text-[9px] leading-tight text-muted-foreground" dir="rtl">
                  {s.labelAr}
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm font-medium hover:bg-muted/50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            Photo / صورة
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
