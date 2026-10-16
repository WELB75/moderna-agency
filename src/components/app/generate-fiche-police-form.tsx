"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LieuVillaSelect, type LieuDomaine, type LieuVilla } from "@/components/app/lieu-villa-select";
import { generateGendarmerieForms, createGroupGendarmerieForm } from "@/lib/actions/gendarmerie";

export function GenerateFichePoliceForm({
  domaines,
  villas,
}: {
  domaines: LieuDomaine[];
  villas: LieuVilla[];
}) {
  const [domaineId, setDomaineId] = useState("");
  const [villaId, setVillaId] = useState("");
  const [nbAdultes, setNbAdultes] = useState("1");
  const [nbEnfants, setNbEnfants] = useState("0");
  const [generatedLinks, setGeneratedLinks] = useState<string[]>([]);
  const [groupLink, setGroupLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!villaId) {
      toast.error("Choisis une villa ou un appartement.");
      return;
    }
    const count = Math.max(1, Math.round(Number(nbAdultes) || 1));
    startTransition(async () => {
      try {
        const forms = await generateGendarmerieForms(villaId, count);
        const links = forms.map((f) => `${window.location.origin}/g/${f.id}`);
        setGeneratedLinks(links);
        setGroupLink(null);
        toast.success(`${links.length} fiche(s) créée(s).`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleGenerateGroup() {
    if (!villaId) {
      toast.error("Choisis une villa ou un appartement.");
      return;
    }
    const adultes = Math.max(1, Math.round(Number(nbAdultes) || 1));
    const enfants = Math.max(0, Math.round(Number(nbEnfants) || 0));
    startTransition(async () => {
      try {
        const form = await createGroupGendarmerieForm(villaId, adultes, enfants);
        setGroupLink(`${window.location.origin}/g/${form.id}`);
        setGeneratedLinks([]);
        toast.success("Lien créé.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    toast.success("Lien copié.");
  }

  async function copyAll() {
    await navigator.clipboard.writeText(generatedLinks.join("\n"));
    toast.success("Tous les liens copiés.");
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <LieuVillaSelect
          domaines={domaines}
          villas={villas}
          domaineId={domaineId}
          villaId={villaId}
          onDomaineChange={setDomaineId}
          onVillaChange={setVillaId}
        />

        <Tabs defaultValue="unique">
          <TabsList className="w-full max-md:group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="unique" className="flex-1 max-md:whitespace-normal max-md:py-2 max-md:text-center">
              Un seul lien pour tout le monde
            </TabsTrigger>
            <TabsTrigger value="individuel" className="flex-1 max-md:whitespace-normal max-md:py-2 max-md:text-center">
              Un lien par adulte
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unique" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">
              Un seul lien à envoyer : la personne remplit tous les adultes et tous les enfants sur la
              même page.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="w-[calc(50%-0.5rem)] space-y-1.5 md:w-[160px]">
                <Label>Nombre d&apos;adultes</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={nbAdultes}
                  onChange={(e) => setNbAdultes(e.target.value)}
                />
              </div>
              <div className="w-[calc(50%-0.5rem)] space-y-1.5 md:w-[160px]">
                <Label>Nombre d&apos;enfants</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={nbEnfants}
                  onChange={(e) => setNbEnfants(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" disabled={isPending} onClick={handleGenerateGroup}>
              <FileText className="h-4 w-4" />
              {isPending ? "Génération..." : "Générer le lien"}
            </Button>

            {groupLink ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Lien à envoyer
                </p>
                <div className="flex items-center justify-between gap-2 rounded-md bg-background p-2">
                  <p className="min-w-0 flex-1 truncate text-sm">{groupLink}</p>
                  <Button type="button" variant="ghost" size="sm" className="max-md:size-11" onClick={() => copyLink(groupLink)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="individuel" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">
              Un Bulletin Individuel par adulte : indique le nombre d&apos;adultes, un lien distinct sera
              généré pour chacun.
            </p>
            <div className="max-w-[calc(50%-0.5rem)] space-y-1.5 md:w-[160px]">
              <Label>Nombre d&apos;adultes</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={nbAdultes}
                onChange={(e) => setNbAdultes(e.target.value)}
              />
            </div>
            <Button type="button" disabled={isPending} onClick={handleGenerate}>
              <FileText className="h-4 w-4" />
              {isPending ? "Génération..." : "Générer les liens"}
            </Button>

            {generatedLinks.length > 0 ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Liens générés
                  </p>
                  <Button type="button" variant="ghost" size="sm" className="max-md:h-10" onClick={copyAll}>
                    <Copy className="h-3.5 w-3.5" />
                    Copier tout
                  </Button>
                </div>
                {generatedLinks.map((link, i) => (
                  <div key={link} className="flex items-center justify-between gap-2 rounded-md bg-background p-2">
                    <p className="min-w-0 flex-1 truncate text-sm">
                      Adulte {i + 1} — {link}
                    </p>
                    <Button type="button" variant="ghost" size="sm" className="max-md:size-11" onClick={() => copyLink(link)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
