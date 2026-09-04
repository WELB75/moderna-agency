// Le contenu d'un message stocké dans whatsapp_conversations.messages suit le format brut de
// l'API Claude (voir src/lib/whatsapp-agent/agent.ts) : soit une simple chaîne, soit un tableau
// de blocs ({type:"text"}, {type:"tool_use"}, {type:"tool_result"}...). Ces helpers en tirent un
// texte affichable pour l'inbox, sans dépendre du SDK Anthropic ici.
export type RenderablePart = { kind: "text"; text: string } | { kind: "tool"; label: string };

const REPRISE_PREFIX = /^\[Reprise après une pause de .*?\]\n/;

export function toRenderableParts(content: unknown): RenderablePart[] {
  if (typeof content === "string") {
    return [{ kind: "text", text: content.replace(REPRISE_PREFIX, "") }];
  }
  if (!Array.isArray(content)) return [];
  const parts: RenderablePart[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push({ kind: "text", text: b.text.replace(REPRISE_PREFIX, "") });
    } else if (b.type === "tool_use" && typeof b.name === "string") {
      parts.push({ kind: "tool", label: String(b.name) });
    }
    // tool_result volontairement ignoré : c'est la réponse technique au tool_use, pas un
    // message conversationnel — déjà représenté par la ligne "tool" correspondante.
  }
  return parts;
}

// Aperçu court (liste des conversations) : le dernier passage textuel, sans les blocs d'outil.
export function previewText(content: unknown): string {
  const parts = toRenderableParts(content);
  const text = parts.find((p) => p.kind === "text") as { kind: "text"; text: string } | undefined;
  if (text) return text.text.trim();
  const tool = parts.find((p) => p.kind === "tool") as { kind: "tool"; label: string } | undefined;
  if (tool) return `→ ${tool.label}`;
  return "";
}
