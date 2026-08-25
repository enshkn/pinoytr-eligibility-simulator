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
  await expect(page.getByLabel("Assessment date")).toHaveAttribute("type", "text");
  await page.getByLabel("Assessment date").click();
  await expect(page.locator(".air-datepicker")).toBeVisible();
  await expect(page.locator(".air-datepicker-nav--title")).toContainText("August");
  await page.locator(".air-datepicker-cell.-day-:not(.-disabled-):not(.-other-month-)").last().click();
  await page.getByLabel("Assessment date").fill("01.01.2026");
  await page.getByLabel("Assessment date").press("Tab");
  await page.getByRole("button", { name: "Add permit period" }).click();
  await page.getByLabel("Permit type").selectOption("family");
  await page.getByLabel("Start date").fill("01.01.2018");
  await page.getByLabel("End date").fill("31.12.2025");

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

test("invalid typed dates cannot reuse an older valid value", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Long-term residence/ }).click();
  await page.getByLabel("Assessment date").fill("01.01.2026");
  await page.getByLabel("Assessment date").press("Tab");
  await page.getByRole("button", { name: "Add permit period" }).click();
  await page.getByLabel("Permit type").selectOption("family");
  await page.getByLabel("Start date").fill("01.01.2018");
  await page.getByLabel("End date").fill("31.12.2025");
  await page.getByLabel("End date").press("Tab");

  await page.getByLabel("Assessment date").fill("31.02.2026");
  await page.getByRole("button", { name: "Calculate pre-assessment" }).click();
  await expect(page.getByRole("alert")).toHaveText("Check the dates and permit types.");
  await expect(page.locator(".result")).toHaveCount(0);

  await page.getByLabel("Assessment date").fill("01.01.2026");
  await page.getByLabel("Start date").fill("02.01.2025");
  await page.getByLabel("End date").fill("01.01.2025");
  await page.getByRole("button", { name: "Calculate pre-assessment" }).click();
  await expect(page.getByRole("alert")).toHaveText("Check the dates and permit types.");
  await expect(page.locator(".result")).toHaveCount(0);
});

test("calendar follows all three interface languages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Long-term residence/ }).click();
  await page.getByLabel("Assessment date").fill("01.01.2026");
  await page.getByLabel("Assessment date").press("Tab");

  await page.locator("#language").selectOption("tr");
  await page.getByLabel("Değerlendirme tarihi").click();
  await expect(page.locator(".air-datepicker-nav--title")).toContainText("Ocak");
  await page.locator(".air-datepicker-cell.-day-:not(.-disabled-):not(.-other-month-)").first().click();

  await page.locator("#language").selectOption("tl");
  await page.getByLabel("Petsa ng pagsusuri").click();
  await expect(page.locator(".air-datepicker-nav--title")).toContainText("Enero");
});

test("manual theme selection overrides the system theme without losing the current flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Long-term residence/ }).click();

  await page.getByLabel("Appearance").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Long-term residence" })).toBeVisible();

  await page.getByLabel("Appearance").selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
});
