import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { technicians } from "@/db/schema";

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
          if (!validTechnician) throw new Error("Non autorisé");
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
