import { expect, test, type Page } from "@playwright/test";

async function startOver(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("dialog", { name: "Start over?" }).getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Today's bookings were reset" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("library-time")).toContainText("1:55 PM");
}

async function openRoom(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Rooms" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

function card(page: Page, range: string) {
  return page.locator("article").filter({ hasText: range });
}

async function book(page: Page, room: string, start: string, end: string, patron: string) {
  await page.getByRole("button", { name: new RegExp(`^Book ${room}, open`) }).first().click();
  const dialog = page.getByRole("dialog", { name: `Book ${room}` });
  await dialog.getByLabel("Start").selectOption(start);
  await dialog.getByLabel("End").selectOption(end);
  await dialog.getByLabel("Patron name").fill(patron);
  await dialog.getByLabel("Library card, last 4").fill("4321");
  await dialog.getByLabel("Party size").fill("2");
  await dialog.getByRole("button", { name: "Book room" }).click();
  return dialog;
}

test.describe("staff board", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await startOver(page);
    await page.close();
  });

  test("shows the seeded day with open time and no released no-shows", async ({ page }) => {
    await startOver(page);
    await openRoom(page, "Study Room A");
    await expect(card(page, "10:00-11:00 AM")).toContainText("Completed");
    const awaiting = card(page, "2:00-3:00 PM");
    await expect(awaiting).toContainText("Booked - awaiting check-in");
    await expect(awaiting).toContainText("Check-in closes 2:15 PM");
    await expect(page.getByRole("button", { name: /^Book Study Room A, open/ }).first()).toBeVisible();

    await openRoom(page, "Study Room B");
    await expect(page.getByText("James Whitfield")).toHaveCount(0);

    const available = page.getByRole("complementary", { name: "Available now" });
    await expect(available.getByText(/free until/).first()).toBeVisible();
    await page.screenshot({ path: "test-results/staff-board-seeded.png", fullPage: true });
  });

  test("All rooms links back to a room's agenda", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "All rooms" }).click();
    const grid = page.getByRole("region", { name: "All rooms schedule" });
    await expect(grid.getByText("Maximum capacity: 4").first()).toBeVisible();
    await page.screenshot({ path: "test-results/staff-board-all-rooms.png", fullPage: true });
    await grid.getByRole("link", { name: "Oak Meeting Room" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Oak Meeting Room" })).toBeVisible();
    await expect(page.getByRole("link", { name: "By room" })).toHaveAttribute("aria-current", "page");
  });

  test("check in, cancel and show the room code", async ({ page }) => {
    await startOver(page);
    await openRoom(page, "Study Room A");
    await card(page, "2:00-3:00 PM").getByRole("button", { name: "Check in" }).click();
    await expect(card(page, "2:00-3:00 PM")).toContainText("Checked in");

    await card(page, "4:00-5:30 PM").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("dialog", { name: "Cancel this booking?" }).getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("Cancelled (1)")).toBeVisible();
    await expect(card(page, "4:00-5:30 PM")).toHaveCount(0);

    await page.getByRole("button", { name: "Show check-in code" }).click();
    const codeDialog = page.getByRole("dialog", { name: "Check-in code for Study Room A" });
    await expect(codeDialog.getByText(/^\d{3} \d{3}$/)).toBeVisible();
    await expect(codeDialog.getByText(/New code in \d+ s/)).toBeVisible();
    await codeDialog.getByRole("button", { name: "Done" }).click();
  });

  test("moving the clock past the window releases a no-show", async ({ page }) => {
    await startOver(page);
    await openRoom(page, "Study Room A");
    await expect(card(page, "2:00-3:00 PM")).toBeVisible();
    for (let i = 0; i < 2; i++) {
      const before = await page.getByTestId("library-time").textContent();
      await page.getByRole("button", { name: "+15 min" }).click();
      await expect(page.getByTestId("library-time")).not.toHaveText(before ?? "");
    }
    await expect(page.getByTestId("library-time")).toContainText("2:25 PM");
    await expect(card(page, "2:00-3:00 PM")).toHaveCount(0);
  });

test("search finds a booking by name or card and moves it to a free room", async ({ page }) => {
    await startOver(page);
    await page.getByRole("link", { name: "All rooms" }).click();
    const search = page.getByLabel("Find a booking");

    await search.fill("okafor");
    const match = page.getByRole("button", { name: /^Daniel Okafor · Study Room A · 2:00-3:00 PM/ });
    await expect(page.getByText("1 match", { exact: true })).toBeVisible();
    await expect(match).toBeVisible();

    await search.fill("7390");
    await expect(match).toBeVisible();

    await match.click();
    const panel = page.getByRole("dialog", { name: "Daniel Okafor" });
    await expect(panel).toContainText("Ends in 7390");
    await panel.getByRole("button", { name: "Move booking" }).click();

    const move = page.getByRole("dialog", { name: "Move Daniel Okafor's booking" });
    await move.getByRole("button", { name: "Study Room D · up to 6" }).click();
    await move.getByRole("button", { name: "Move booking" }).click();
    await expect(page.getByRole("status")).toContainText("Moved Daniel Okafor to Study Room D, 2:00-3:00 PM.");

    await page.goto("/");
    await openRoom(page, "Study Room D");
    await expect(card(page, "2:00-3:00 PM")).toContainText("Daniel Okafor");
    await openRoom(page, "Study Room A");
    await expect(card(page, "2:00-3:00 PM")).toHaveCount(0);
  });

  test("moving into a taken time is blocked with alternatives", async ({ page }) => {
    await startOver(page);
    await openRoom(page, "Study Room B");
    await card(page, "3:00-4:00 PM").getByRole("button", { name: "Move booking" }).click();
    const move = page.getByRole("dialog", { name: "Move Grace Kim's booking" });
    await move.getByLabel("Room").selectOption({ label: "Study Room D (up to 6)" });
    await move.getByRole("button", { name: "Move booking" }).click();
    const alert = move.getByRole("alert");
    await expect(alert).toContainText("This room is taken 3:30-5:00 PM");
    await expect(alert.getByRole("button").first()).toBeVisible();
    await expect(card(page, "3:00-4:00 PM")).toContainText("Grace Kim");
  });

  test("toasts confirm success and explain failures", async ({ page, browser }) => {
    await startOver(page);
    await openRoom(page, "Study Room A");
    await card(page, "2:00-3:00 PM").getByRole("button", { name: "Check in" }).click();
    const toast = page.getByRole("status");
    await expect(toast).toContainText("Checked in Daniel Okafor.");
    await toast.getByRole("button", { name: "Dismiss message" }).click();
    await expect(toast).toBeEmpty();

    await openRoom(page, "Study Room B");
    const other = await browser.newPage();
    await startOver(other);
    await other.close();
    await card(page, "3:00-4:00 PM").getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("dialog", { name: "Cancel this booking?" }).getByRole("button", { name: "Cancel booking" }).click();
    await expect(toast).toContainText("Error: This booking changed. The board has been refreshed.");
  });

  test("scenario 1: a conflicting booking is blocked with free alternatives", async ({ page }) => {
    const year = 2030 + Math.floor(Math.random() * 10);
    let day = new Date(Date.UTC(year, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)));
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() + 86_400_000);
    const date = day.toISOString().slice(0, 10);

    await page.goto("/");
    await page.getByRole("button", { name: "Set time" }).click();
    const timeDialog = page.getByRole("dialog", { name: "Set library time" });
    await timeDialog.getByLabel("Date").fill(date);
    await timeDialog.getByLabel("Time").fill("10:00");
    await timeDialog.getByRole("button", { name: "Set time" }).click();
    await expect(page.getByTestId("library-time")).toContainText("10:00 AM");

    await openRoom(page, "Study Room A");
    await book(page, "Study Room A", "14:00", "15:00", "Playwright First");
    await expect(card(page, "2:00-3:00 PM")).toContainText("Playwright First");

    const dialog = await book(page, "Study Room A", "14:30", "15:30", "Playwright Second");
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("This room is taken 2:00-3:00 PM");
    await expect(alert.getByRole("button").first()).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Playwright Second" })).toHaveCount(0);

    await alert.getByRole("button", { name: /^Study Room A, 3:00-4:00 PM/ }).click();
    await dialog.getByRole("button", { name: "Book room" }).click();
    await expect(card(page, "3:00-4:00 PM")).toContainText("Playwright Second");
    await expect(card(page, "2:00-3:00 PM")).toHaveCount(1);
  });
});
