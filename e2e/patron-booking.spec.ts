import { devices, expect, test, type Browser, type Page } from "@playwright/test";

test.use({ ...devices["Pixel 7"] });

async function staffPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

async function setLibraryDate(staff: Page): Promise<void> {
  const year = 2030 + Math.floor(Math.random() * 10);
  let day = new Date(Date.UTC(year, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() + 86_400_000);
  await staff.goto("/");
  await staff.getByRole("button", { name: "Set time" }).click();
  const dialog = staff.getByRole("dialog", { name: "Set library time" });
  await dialog.getByLabel("Date").fill(day.toISOString().slice(0, 10));
  await dialog.getByLabel("Time").fill("10:00");
  await dialog.getByRole("button", { name: "Set time" }).click();
  await expect(staff.getByTestId("library-time")).toContainText("10:00 AM");
}

async function pickTime(page: Page, room: string, start: string, length: string) {
  await page.goto("/book");
  await page.getByRole("link", { name: new RegExp(room) }).click();
  await expect(page.getByRole("heading", { level: 1, name: room })).toBeVisible();
  await page.getByRole("link", { name: start, exact: true }).click();
  await page.getByRole("link", { name: new RegExp(`^${length}\\s*\\d{1,2}:`) }).click();
  await expect(page.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
}

async function fillPatron(page: Page, name: string, party: string) {
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Last 4 digits of your library card").fill("2468");
  await page.getByLabel("How many people?").fill(party);
}

test.describe("patron booking", () => {
  test.afterAll(async ({ browser }) => {
    const staff = await staffPage(browser);
    await staff.goto("/");
    await staff.getByRole("button", { name: "Start over" }).click();
    await staff.getByRole("dialog", { name: "Start over?" }).getByRole("button", { name: "Start over" }).click();
    await expect(staff.getByRole("status")).toContainText("Today's bookings were reset");
    await staff.close();
  });

  test("a patron books a room from a phone and gets check-in instructions", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    await setLibraryDate(staff);

    await page.goto("/book");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(8);
    await page.getByRole("link", { name: "Meeting rooms" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);

    await pickTime(page, "Oak Meeting Room", "2:00 PM", "1 hour");
    await fillPatron(page, "Phone Patron", "4");
    await page.getByRole("button", { name: "Book this room" }).click();

    await expect(page.getByRole("heading", { name: "Your room is booked" })).toBeVisible();
    await expect(page.getByText(/^[A-HJ-NP-Z2-9]{6}$/)).toBeVisible();
    await expect(page.getByText("Check in between 1:50 and 2:15 PM or the room is released.")).toBeVisible();
    await expect(page.getByText("Scan the code on the room's door display with your phone camera.")).toBeVisible();
    await page.screenshot({ path: "test-results/patron-booked.png", fullPage: true });

    await staff.goto("/");
    await staff.getByRole("navigation", { name: "Rooms" }).getByRole("link", { name: /^Oak Meeting Room/ }).click();
    await expect(staff.locator("article").filter({ hasText: "Phone Patron" })).toContainText("Web");
    await staff.close();
  });

  test("a slot taken while confirming shows free alternatives", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    await setLibraryDate(staff);

    await pickTime(page, "Study Room A", "3:00 PM", "1 hour");
    await fillPatron(page, "Slow Patron", "2");

    await staff.goto("/");
    await staff.getByRole("button", { name: /^Book Study Room A, open/ }).first().click();
    const dialog = staff.getByRole("dialog", { name: "Book Study Room A" });
    await dialog.getByLabel("Start").selectOption("15:00");
    await dialog.getByLabel("End").selectOption("16:00");
    await dialog.getByLabel("Patron name").fill("Desk Patron");
    await dialog.getByLabel("Library card, last 4").fill("1357");
    await dialog.getByLabel("Party size").fill("1");
    await dialog.getByRole("button", { name: "Book room" }).click();
    await expect(staff.getByRole("status")).toContainText("Booked Study Room A");
    await staff.close();

    await page.getByRole("button", { name: "Book this room" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Sorry" });
    await expect(alert).toContainText("Sorry, someone just booked this time.");
    await alert.getByRole("button").first().click();
    await page.getByRole("button", { name: "Book this room" }).click();
    await expect(page.getByRole("heading", { name: "Your room is booked" })).toBeVisible();
  });
});
