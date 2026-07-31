"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Upload, X, RotateCcw, RotateCw, Loader2, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { LieuVillaSelect, type LieuDomaine, type LieuVilla } from "@/components/app/lieu-villa-select";
import { analyzePassportImage, saveImportedGendarmerieForm } from "@/lib/actions/gendarmerie-import";
import { FIELD_KEYS, FIELD_LABELS, DATE_FIELD_KEYS } from "@/lib/gendarmerie-i18n";
import type { OccupantInput } from "@/lib/actions/gendarmerie";

const DISPLAY_FIELD_KEYS = FIELD_KEYS.filter((k) => k !== "signatureNom" && k !== "allantA");
const labels = FIELD_LABELS.fr;

type Row = {
  id: string;
  fileName: string;
  status: "processing" | "done" | "error";
  occupant: OccupantInput;
  warnings: string[];
  error?: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function rotateDataUrl(dataUrl: string, degrees: 90 | -90): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas indisponible."));
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = dataUrl;
  });
}

export function PassportDropZone({ domaines, villas }: { domaines: LieuDomaine[]; villas: LieuVilla[] }) {
  const [domaineId, setDomaineId] = useState("");
  const [villaId, setVillaId] = useState("");
  const [dateArrivee, setDateArrivee] = useState(todayIso());
  const [rows, setRows] = useState<Row[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [savedLink, setSavedLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function processFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setSavedLink(null);

    const newRows: Row[] = imageFiles.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      fileName: f.name,
      status: "processing",
      occupant: { nom: "", prenom: "", dateNaissance: "", lieuNaissance: "", nationalite: "", profession: "", venantDe: "", allantA: "Maroc", dateArrivee: "", domicileHabituel: "", typePiece: "", numeroPiece: "", datePiece: "", lieuPiece: "", signatureNom: "", signatureImage: "", photoPieceUrl: "" },
      warnings: [],
    }));
    setRows((prev) => [...prev, ...newRows]);

    for (let i = 0; i < imageFiles.length; i++) {
      const rowId = newRows[i].id;
      try {
        const formData = new FormData();
        formData.append("file", imageFiles[i]);
        const result = await analyzePassportImage(formData);
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, status: "done", occupant: result.occupant, warnings: result.warnings } : r))
        );
      } catch (err) {
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, status: "error", error: err instanceof Error ? err.message : "Erreur." } : r))
        );
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }

  function updateOccupant(rowId: string, key: keyof OccupantInput, value: string) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, occupant: { ...r.occupant, [key]: value } } : r)));
  }

  async function rotateRow(rowId: string, degrees: 90 | -90) {
    const row = rows.find((r) => r.id === rowId);
    if (!row?.occupant.photoPieceUrl) return;
    try {
      const rotated = await rotateDataUrl(row.occupant.photoPieceUrl, degrees);
      updateOccupant(rowId, "photoPieceUrl", rotated);
    } catch {
      toast.error("Rotation impossible.");
    }
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  function handleSave() {
    if (!villaId) {
      toast.error("Choisis une villa ou un appartement.");
      return;
    }
    const occupants = rows
      .filter((r) => r.status === "done")
      .map((r) => ({ ...r.occupant, dateArrivee }));
    startTransition(async () => {
      try {
        const { id } = await saveImportedGendarmerieForm(villaId, occupants);
        setSavedLink(`${window.location.origin}/gendarmerie/${id}`);
        setRows([]);
        toast.success("Fiche police enregistrée.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  const doneCount = rows.filter((r) => r.status === "done").length;
  const processingCount = rows.filter((r) => r.status === "processing").length;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <p className="font-medium">Importer des passeports</p>
          <p className="text-sm text-muted-foreground">
            Dépose plusieurs photos de passeport d&apos;un coup : elles sont redressées automatiquement, et les
            champs identifiables sont préremplis — vérifie et complète avant d&apos;enregistrer.
          </p>
        </div>

        <LieuVillaSelect
          domaines={domaines}
          villas={villas}
          domaineId={domaineId}
          villaId={villaId}
          onDomaineChange={setDomaineId}
          onVillaChange={setVillaId}
        />

        <div className="max-w-[220px] space-y-1.5">
          <Label>Date d&apos;arrivée</Label>
          <Input type="date" value={dateArrivee} onChange={(e) => setDateArrivee(e.target.value)} />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Dépose les photos de passeport ici</p>
          <p className="text-xs text-muted-foreground">ou clique pour choisir des fichiers — plusieurs à la fois</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) processFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {doneCount} lu(s){processingCount > 0 ? ` · ${processingCount} en cours...` : ""}
            </p>
            {rows.map((row) => (
              <Card key={row.id} className="bg-muted/30">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{row.fileName}</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {row.status === "processing" ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Lecture en cours...
                    </div>
                  ) : row.status === "error" ? (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {row.error}
                    </p>
                  ) : (
                    <>
                      {row.occupant.photoPieceUrl ? (
                        <div className="flex items-start gap-2">
                          <Image
                            src={row.occupant.photoPieceUrl}
                            alt="Passeport"
                            width={220}
                            height={140}
                            unoptimized
                            className="h-28 w-auto rounded-md border object-cover"
                          />
                          <div className="flex flex-col gap-1">
                            <Button type="button" variant="outline" size="icon" onClick={() => rotateRow(row.id, -90)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => rotateRow(row.id, 90)}>
                              <RotateCw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {row.warnings.length > 0 ? (
                        <div className="space-y-0.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {row.warnings.map((w, i) => (
                            <p key={i} className="flex items-start gap-1">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {w}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {DISPLAY_FIELD_KEYS.map((key) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs">{labels[key]}</Label>
                            <Input
                              type={DATE_FIELD_KEYS.includes(key) ? "date" : "text"}
                              value={row.occupant[key]}
                              onChange={(e) => updateOccupant(row.id, key, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            <Button type="button" disabled={isPending || processingCount > 0 || doneCount === 0} onClick={handleSave}>
              <FileText className="h-4 w-4" />
              {isPending ? "Enregistrement..." : `Enregistrer la fiche (${doneCount})`}
            </Button>
          </div>
        ) : null}

        {savedLink ? (
          <div className="space-y-1 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fiche enregistrée</p>
            <a href={savedLink} className="text-sm text-primary underline">
              {savedLink}
            </a>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
