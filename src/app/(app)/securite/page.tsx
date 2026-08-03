import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VillaSecurityBlock } from "@/components/app/villa-security-block";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { getSecuriteDomaines, getVillasSecurityDataForDomaine } from "@/lib/security-data";

export default async function SecuritePage() {
  const domaines = await getSecuriteDomaines();
  const parDomaine = await Promise.all(
    domaines.map(async (d) => ({ domaine: d, data: await getVillasSecurityDataForDomaine(d.id) }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sécurité</h1>
        <p className="text-sm text-muted-foreground">
          Un lien par domaine à envoyer à l&apos;agent de sécurité concerné — chaque domaine a ses
          propres agents, ne pas mélanger.
        </p>
      </div>

      {domaines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun domaine pour l&apos;instant.</p>
      ) : (
        <Tabs defaultValue={domaines[0].id}>
          <TabsList className="w-full flex-nowrap justify-start overflow-x-auto">
            {domaines.map((d) => (
              <TabsTrigger key={d.id} value={d.id} className="shrink-0">
                {d.nom}
              </TabsTrigger>
            ))}
          </TabsList>

          {parDomaine.map(({ domaine, data }) => (
            <TabsContent key={domaine.id} value={domaine.id} className="space-y-4 pt-2">
              <div className="flex flex-wrap gap-2">
                <CopyLinkButton
                  path={`/securite/domaine/${domaine.id}`}
                  label="Copier le lien général"
                  successMessage={`Lien copié — envoie-le une fois à la sécurité de ${domaine.nom}.`}
                />
                <CopyLinkButton
                  path={`/securite/domaine/${domaine.id}?jour=1`}
                  label="Copier le lien du jour"
                  successMessage={`Lien copié — n'affiche que les arrivées du jour pour ${domaine.nom}.`}
                />
              </div>

              {!data || data.villas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune villa pour ce domaine.</p>
              ) : (
                <div className="space-y-2">
                  {data.villas.map((v) => (
                    <details key={v.villaId} className="group rounded-md border">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3">
                        <span className="font-medium">
                          {v.villaNom} (n°{v.villaNumero})
                        </span>
                        <span className="text-xs text-muted-foreground group-open:hidden">Voir</span>
                        <span className="hidden text-xs text-muted-foreground group-open:inline">Masquer</span>
                      </summary>
                      <div className="border-t p-3 pt-2">
                        <VillaSecurityBlock data={v} showVillaHeader={false} />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
