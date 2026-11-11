type GuestDocument = { name: string; dataUrl: string };
type GuestImage = { dataUrl: string };

const types: Record<string, { extension: string; magic?: string }> = {
  "application/pdf": { extension: ".pdf", magic: "%PDF-" },
  "text/plain": { extension: ".txt" },
  "text/csv": { extension: ".csv" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extension: ".docx", magic: "PK",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    extension: ".xlsx", magic: "PK",
  },
};

function dataUri(raw: string, limit: number): { mime: string; bytes: Buffer } {
  if (raw.length > Math.ceil(limit * 4 / 3) + 220) throw new Error("INVALID_MEDIA");
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-zA-Z0-9+/]+={0,2})$/i.exec(raw);
  if (!match || match[2].length % 4 !== 0) throw new Error("INVALID_MEDIA");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > limit) throw new Error("INVALID_MEDIA");
  return { mime: match[1].toLowerCase(), bytes };
}

/** Validate decoded bytes, MIME and filename together before forwarding guest files. */
export function guestDocumentContent(doc: GuestDocument): Record<string, string> {
  const { mime, bytes } = dataUri(doc.dataUrl, 256_000);
  const config = types[mime];
  const safeName = doc.name.replace(/[\\/]/g, "_").trim().slice(0, 120);
  if (!config || !safeName.toLowerCase().endsWith(config.extension) ||
      safeName.length <= config.extension.length) throw new Error("INVALID_GUEST_DOCUMENT");
  if (config.magic && !bytes.subarray(0, config.magic.length).equals(Buffer.from(config.magic)))
    throw new Error("INVALID_GUEST_DOCUMENT");
  // Office documents must be ZIP archives, with a valid ZIP local file or empty archive header.
  if (config.magic === "PK" && !["0304", "0506", "0708"].includes(bytes.subarray(2, 4).toString("hex")))
    throw new Error("INVALID_GUEST_DOCUMENT");
  if (mime.startsWith("text/") && bytes.includes(0))
    throw new Error("INVALID_GUEST_DOCUMENT");
  return { type: "input_file", filename: safeName, file_data: doc.dataUrl };
}

export function guestImageContent(image: GuestImage): Record<string, string> {
  const { mime, bytes } = dataUri(image.dataUrl, 1_000_000);
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!((mime === "image/jpeg" && jpg) || (mime === "image/png" && png) ||
    (mime === "image/webp" && webp))) throw new Error("INVALID_IMAGE");
  return { type: "input_image", image_url: image.dataUrl };
}
