import { expect, test, type Page } from "@playwright/test";
import { freshWeekday, roomInfo, setLibraryTime, staffPage } from "./support";

const ROOM = "Study Room A";

async function staffBooks(staff: Page, start: string, end: string, patron: string): Promise<void> {
  await staff.goto("/");
  await staff.getByRole("navigation", { name: "Rooms" }).getByRole("link", { name: new RegExp(`^${ROOM}`) }).click();
  await expect(staff.getByRole("heading", { level: 2, name: ROOM })).toBeVisible();
  await staff.getByRole("button", { name: new RegExp(`^Book ${ROOM}, open`) }).first().click();
  const dialog = staff.getByRole("dialog", { name: `Book ${ROOM}` });
  await dialog.getByLabel("Start").selectOption(start);
  await dialog.getByLabel("End").selectOption(end);
  await dialog.getByLabel("Patron name").fill(patron);
  await dialog.getByLabel("Library card, last 4").fill("4321");
  await dialog.getByLabel("Party size").fill("2");
  await dialog.getByRole("button", { name: "Book room" }).click();
  await expect(staff.getByRole("status").filter({ hasText: `Booked ${ROOM}` })).toBeVisible();
}

function slot(page: Page, label: string) {
  return page.getByRole("listitem").filter({ hasText: new RegExp(`^${label}`) });
}

test.describe("live updates", () => {
  test.afterAll(async ({ browser }) => {
    const staff = await staffPage(browser);
    await staff.goto("/");
    await staff.getByRole("button", { name: "Start over" }).click();
    await staff.getByRole("dialog", { name: "Start over?" }).getByRole("button", { name: "Start over" }).click();
    await expect(staff.getByRole("status").filter({ hasText: "Today's bookings were reset" })).toBeVisible();
    await staff.close();
  });

  test("scenario 2: a staff booking shows as taken on the patron page within 2 seconds", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo(ROOM);
    await setLibraryTime(staff, day, "10:00", "10:00 AM");

    await page.goto(`/book/${room.id}?date=${day}`);
    await expect(page.getByTestId("live-indicator")).toHaveText("Live");
    await expect(page.getByRole("link", { name: "4:00 PM", exact: true })).toBeVisible();

    await staffBooks(staff, "16:00", "17:00", "Live Patron");

    await expect(page.getByRole("link", { name: "4:00 PM", exact: true })).toHaveCount(0, { timeout: 2000 });
    const taken = slot(page, "4:00 PM");
    await expect(taken).toContainText("Taken");
    await expect(taken).toHaveAttribute("data-live-changed", "");
    await staff.close();
  });

  test("falls back to polling when the live connection is down", async ({ page, browser }) => {
    await page.context().routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => ws.close());
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo(ROOM);
    await setLibraryTime(staff, day, "10:00", "10:00 AM");

    await page.goto(`/book/${room.id}?date=${day}`);
    const indicator = page.getByTestId("live-indicator");
    await expect(indicator).toHaveAttribute("data-mode", "fallback");
    await expect(indicator).not.toHaveText("Live");
    await expect(page.getByRole("link", { name: "3:00 PM", exact: true })).toBeVisible();

    await staffBooks(staff, "15:00", "16:00", "Polling Patron");

    await expect(page.getByRole("link", { name: "3:00 PM", exact: true })).toHaveCount(0, { timeout: 15_000 });
    await expect(indicator).not.toHaveText("Live");
    await staff.close();
  });
});
