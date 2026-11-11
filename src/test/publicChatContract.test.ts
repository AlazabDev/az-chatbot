import { describe, expect, it } from "vitest";
import { guestDocumentContent, guestImageContent } from "@/lib/guestMedia.server";
import { publicChatSchema, publicRestChatSchema, normalizePublicChatError } from "@/lib/publicChatContract";

const encoded = (mime: string, bytes: Buffer) =>
  "data:" + mime + ";base64," + bytes.toString("base64");

function sampleOfficeZip(documentEntry: string): Buffer {
  const filenames = ["[Content_Types].xml", documentEntry];
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of filenames) {
    const filename = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length;
  }
  const index = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(filenames.length, 8);
  end.writeUInt16LE(filenames.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}

describe("public REST and RPC contracts", () => {
  it("enforces message-or-media on both contracts", () => {
    const blank = { message: "", visitorId: crypto.randomUUID() };
    expect(publicRestChatSchema.safeParse(blank).success).toBe(false);
    expect(publicChatSchema.safeParse({ ...blank, agentId: crypto.randomUUID() }).success).toBe(false);
    expect(publicRestChatSchema.safeParse({ message: "hello" }).success).toBe(true);
  });
  it("normalizes budget, origin, agent and invalid media errors", () => {
    expect(normalizePublicChatError(new Error("CHAT_DAILY_BUDGET_EXCEEDED"))).toEqual({
      status: 429, code: "BUDGET_EXHAUSTED",
    });
    expect(normalizePublicChatError(new Error("FORBIDDEN_ORIGIN")).status).toBe(403);
    expect(normalizePublicChatError(new Error("AGENT_UNAVAILABLE")).status).toBe(404);
    expect(normalizePublicChatError(new Error("INVALID_GUEST_DOCUMENT"))).toEqual({
      status: 400, code: "INVALID_MEDIA",
    });
  });
});

describe("bounded guest document validation", () => {
  it("accepts legitimate PDF, CSV, text, DOCX and XLSX container headers", () => {
    for (const [mime, name, prefix] of [
      ["application/pdf", "example.pdf", "%PDF-1.4"],
      ["text/plain", "note.txt", "hello"],
      ["text/csv", "sheet.csv", "a,b\n1,2"],
    ]) {
      const item = { name, dataUrl: encoded(mime, Buffer.from(prefix, "binary")) };
      expect(guestDocumentContent(item)).toMatchObject({ type: "input_file", filename: name });
    }
    expect(guestDocumentContent({
      name: "test.docx",
      dataUrl: encoded("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sampleOfficeZip("word/document.xml")),
    }).filename).toBe("test.docx");
    expect(guestDocumentContent({
      name: "test.xlsx",
      dataUrl: encoded("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sampleOfficeZip("xl/workbook.xml")),
    }).filename).toBe("test.xlsx");
  });
  it("rejects MIME/extension mismatches and fake PDF or ZIP", () => {
    expect(() => guestDocumentContent({ name: "fake.pdf",
      dataUrl: encoded("application/pdf", Buffer.from("not a PDF")) })).toThrow();
    expect(() => guestDocumentContent({ name: "wrong.txt",
      dataUrl: encoded("text/csv", Buffer.from("a,b")) })).toThrow();
    expect(() => guestDocumentContent({ name: "fake.docx",
      dataUrl: encoded("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Buffer.from("PK\x00\x00", "binary")) })).toThrow();
  });
  it("rejects oversized documents", () => {
    expect(() => guestDocumentContent({ name: "big.pdf",
      dataUrl: encoded("application/pdf", Buffer.concat([
        Buffer.from("%PDF-"), Buffer.alloc(256_000),
      ])) })).toThrow();
  });
  it("rejects fake image payloads", () => {
    expect(() => guestImageContent({ dataUrl: encoded("image/png", Buffer.from("fake image")) })).toThrow();
  });
});
