import { NextResponse } from "next/server";
import { marquerConversationLue } from "@/lib/actions/messages-lus";

// Marque une conversation comme lue — route API (fetch) pour ne pas passer par la file des Server
// Actions, qui est partagée avec la navigation.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { key?: unknown };
    await marquerConversationLue(String(body.key ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[messages/lue]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
