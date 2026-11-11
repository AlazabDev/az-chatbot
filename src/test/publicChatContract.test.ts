import { describe, expect, it } from "vitest";
import { guestDocumentContent, guestImageContent } from "@/lib/guestMedia.server";
import { publicChatSchema, publicRestChatSchema, normalizePublicChatError } from "@/lib/publicChatContract";

const encoded = (mime: string, bytes: Buffer) =>
  "data:" + mime + ";base64," + bytes.toString("base64");

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
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "test.docx", "PK\x03\x04"],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "test.xlsx", "PK\x03\x04"],
    ]) {
      const item = { name, dataUrl: encoded(mime, Buffer.from(prefix, "binary")) };
      expect(guestDocumentContent(item)).toMatchObject({ type: "input_file", filename: name });
    }
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
