import { test, expect } from "@playwright/test";

const privateAgent = "az-agent-finance";
const visitorId = "11111111-1111-4111-8111-111111111111";

test("guest can open the help chat without Supabase authentication", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("textbox", { name: "نص الرسالة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إرسال" })).toBeVisible();
  await expect(page).not.toHaveURL(/login|sign-in|auth\/callback/);
});

test("private agent cannot be invoked through public REST API", async ({ request }) => {
  test.skip(!process.env.CHATBOT_E2E_URL, "Requires a configured staging Supabase connection");
  const res = await request.post("/api/public/agents/" + privateAgent, {
    data: { message: "test", visitorId },
    headers: { Origin: "http://127.0.0.1:4173" },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe("AGENT_UNAVAILABLE");
});

test("cross-origin unsafe requests are denied before any provider call", async ({ request }) => {
  const res = await request.post("/api/public/agents/az-agent-azabot", {
    data: { message: "test", visitorId },
    headers: { Origin: "https://other-tenant.example" },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).error).toBe("FORBIDDEN_ORIGIN");
});

test("malformed public input fails without invoking AI", async ({ request }) => {
  const res = await request.post("/api/public/agents/az-agent-azabot", {
    data: { message: "", visitorId },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe("INVALID_REQUEST");
});
