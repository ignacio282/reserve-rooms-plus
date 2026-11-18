import { expect, test } from "@playwright/test";

test("staff board renders its main content", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Rooms" })).toBeVisible();
  await expect(page.getByText("Maple Hollow Public Library")).toBeVisible();
});
