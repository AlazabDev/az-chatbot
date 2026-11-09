import type { ChatMessage, ExportFormat } from "@/types/chat";

function fmtTime(ts: number): string {
  return new Date(ts).toISOString();
}

export function exportToTxt(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const who = m.role === "user" ? "User" : "Assistant";
      const files =
        m.files && m.files.length ? `\n  Files: ${m.files.map((f) => f.name).join(", ")}` : "";
      return `[${fmtTime(m.timestamp)}] ${who}:\n  ${m.content}${files}`;
    })
    .join("\n\n");
}

export function exportToJson(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      files: m.files ?? [],
      timestamp: m.timestamp,
    })),
    null,
    2,
  );
}

export function exportToMarkdown(messages: ChatMessage[]): string {
  const lines: string[] = ["# Chat Transcript", ""];
  for (const m of messages) {
    const who = m.role === "user" ? "**User**" : "**Assistant**";
    lines.push(`### ${who} — _${fmtTime(m.timestamp)}_`);
    lines.push("");
    lines.push(m.content);
    if (m.files && m.files.length) {
      lines.push("");
      lines.push("**Attachments:**");
      m.files.forEach((f) => lines.push(`- ${f.name} (${f.size} bytes)`));
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadChat(messages: ChatMessage[], format: ExportFormat): void {
  let content = "";
  let mime = "text/plain";
  let ext = "txt";
  switch (format) {
    case "json":
      content = exportToJson(messages);
      mime = "application/json";
      ext = "json";
      break;
    case "md":
      content = exportToMarkdown(messages);
      mime = "text/markdown";
      ext = "md";
      break;
    default:
      content = exportToTxt(messages);
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
