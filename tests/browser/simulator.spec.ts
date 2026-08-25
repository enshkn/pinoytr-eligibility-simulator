import { expect, test } from "@playwright/test";

test("a mobile user completes the long-term residence flow and receives iframe resize messages", async ({ page }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1:5173")) externalRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Which path do you want to assess?" })).toBeVisible();

  await page.getByRole("button", { name: /Long-term residence/ }).click();
  await page.getByLabel("Assessment date").fill("2026-01-01");
  await page.getByRole("button", { name: "Add permit period" }).click();
  await page.getByLabel("Permit type").selectOption("family");
  await page.getByLabel("Start date").fill("2018-01-01");
  await page.getByLabel("End date").fill("2025-12-31");

  for (const select of await page.locator("[data-condition]").all()) await select.selectOption("yes");
  await page.getByRole("button", { name: "Calculate pre-assessment" }).click();

  await expect(page.getByRole("heading", { name: "You appear to have reached the duration threshold" })).toBeVisible();
  await page.getByText("Calculation details").click();
  await expect(page.getByText("Fully counted days")).toBeVisible();

  await page.evaluate(() => {
    (window as typeof window & { resizeMessage?: unknown }).resizeMessage = undefined;
    window.addEventListener("message", (event) => {
      if (event.data?.type === "pinoytr:resize") (window as typeof window & { resizeMessage?: unknown }).resizeMessage = event.data;
    }, { once: true });
  });
  await page.getByRole("button", { name: "Add permit period" }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { resizeMessage?: unknown }).resizeMessage))).toBe(true);

  await page.locator("#language").selectOption("tl");
  await expect(page.getByRole("heading", { name: "Pangmatagalang residence permit" })).toBeVisible();
  await expect(page.locator("[data-permit-id]")).toHaveCount(2);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
