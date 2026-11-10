import { afterEach, expect, it } from "vitest";
import { DEFAULT_AZURE_CONFIG, loadAzureConfig, saveAzureConfig } from "@/lib/adminConfig";

afterEach(() => localStorage.clear());
it("does not persist a private Azure key", () => {
  saveAzureConfig({ ...DEFAULT_AZURE_CONFIG, apiKey: "private-test-key" });
  expect(JSON.parse(localStorage.getItem("azab.admin.azure") || "{}").apiKey).toBe("");
});
it("removes a legacy private key when settings are loaded", () => {
  localStorage.setItem("azab.admin.azure", JSON.stringify({ apiKey: "private-test-key" }));
  expect(loadAzureConfig().apiKey).toBe("");
  expect(localStorage.getItem("azab.admin.azure")).not.toContain("private-test-key");
});