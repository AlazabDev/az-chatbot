// Azure AI Vision — Image Analysis 4.0 (read/OCR + caption + tags)
const ENDPOINT = (Deno.env.get("AZURE_VISION_ENDPOINT") ?? "").replace(/\/+$/, "");
const KEY = Deno.env.get("AZURE_VISION_KEY") ?? "";

export function visionConfigured() {
  return Boolean(ENDPOINT && KEY);
}

export interface VisionResult {
  ocrText: string;
  caption?: string;
  tags: string[];
  raw: unknown;
}

export async function analyzeImage(
  bytes: Uint8Array,
  contentType = "image/jpeg",
): Promise<VisionResult> {
  if (!visionConfigured())
    throw new Error("AZURE_VISION_ENDPOINT / AZURE_VISION_KEY not configured");

  const url =
    `${ENDPOINT}/computervision/imageanalysis:analyze` +
    `?api-version=2024-02-01&features=read,caption,tags&gender-neutral-caption=true`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": KEY, "Content-Type": contentType },
    body: bytes as BodyInit,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Azure Vision ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }

  const blocks = json?.readResult?.blocks ?? [];
  const ocrText = blocks.flatMap((b: any) => (b.lines ?? []).map((l: any) => l.text)).join("\n");

  return {
    ocrText,
    caption: json?.captionResult?.text,
    tags: (json?.tagsResult?.values ?? []).map((t: any) => t.name),
    raw: json,
  };
}
