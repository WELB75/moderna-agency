import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { technicians, villas } from "@/db/schema";
import { isValidMaintenanceToken } from "@/lib/maintenance-access-token";

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!userId) {
          // Upload non authentifié : uniquement le technicien via son lien perso /t/[token],
          // sans compte Clerk. Portée limitée aux photos d'intervention, vérifiée contre un
          // token technicien existant en base (même principe que les liens propriétaire/i/[id]).
          const isTechnicianUpload = pathname.startsWith("interventions/") && Boolean(clientPayload);
          const validTechnician =
            isTechnicianUpload &&
            (await getDb()
              .select({ id: technicians.id })
              .from(technicians)
              .where(eq(technicians.accessToken, clientPayload as string))
              .limit(1)
              .then((rows) => rows.length > 0));

          // Lien minimal "travaux" (/travaux/[token], voir interventions.ts) : même principe que
          // le technicien ci-dessus, vérifié contre le token propriétaire d'une villa plutôt
          // qu'un compte. Kamel, 2026-09-09 : "le genre de formulaire scann ia".
          const isTravauxUpload = pathname.startsWith("travaux/") && Boolean(clientPayload);
          const validTravauxToken =
            isTravauxUpload &&
            (await getDb()
              .select({ id: villas.id })
              .from(villas)
              .where(eq(villas.lienProprietaireToken, clientPayload as string))
              .limit(1)
              .then((rows) => rows.length > 0));

          // Espace maintenance public (/m/[token]) : jeton unique partagé plutôt qu'un token par
          // technicien ou par villa, portée sur toutes les interventions — voir
          // maintenance-access-token.ts et interventions.ts (actions "ByMaintenanceToken").
          const isMaintenanceUpload = pathname.startsWith("interventions/") && Boolean(clientPayload);
          const validMaintenanceToken = isMaintenanceUpload && isValidMaintenanceToken(clientPayload as string);

          if (!validTechnician && !validTravauxToken && !validMaintenanceToken) throw new Error("Non autorisé");
        }

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "audio/ogg",
            "audio/mpeg",
            "audio/mp4",
            "audio/webm",
            "audio/wav",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId, pathname }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Échec de l'upload" },
      { status: 400 }
    );
  }
}
