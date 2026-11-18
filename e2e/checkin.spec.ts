import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";
import {
  codeFrom,
  freshWeekday,
  patronBooks,
  readDoorCode,
  roomInfo,
  setLibraryTime,
  staffPage,
  tabTo,
} from "./support";

test.use({ ...devices["Pixel 7"] });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function boardCard(staff: Page, room: string, range: string) {
  await staff.goto("/");
  await staff.getByRole("navigation", { name: "Rooms" }).getByRole("link", { name: new RegExp(`^${room}`) }).click();
  await expect(staff.getByRole("heading", { level: 2, name: room })).toBeVisible();
  return staff.locator("article").filter({ hasText: range });
}

test.describe("door display and check-in", () => {
  test.afterAll(async ({ browser }) => {
    const staff = await staffPage(browser);
    await staff.goto("/");
    await staff.getByRole("button", { name: "Start over" }).click();
    await staff.getByRole("dialog", { name: "Start over?" }).getByRole("button", { name: "Start over" }).click();
    await expect(staff.getByRole("status").filter({ hasText: "Today's bookings were reset" })).toBeVisible();
    await staff.close();
  });

  test("scenarios 3 and 6: too early, then check-in from the booking page with the door code", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo("Study Room B");
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const booking = await patronBooks(page, "Study Room B", "2:00 PM", "1 hour");

    await setLibraryTime(staff, day, "13:30", "1:30 PM");
    await page.goto(`/r/${room.token}`);
    await expect(page.getByTestId("room-status")).toContainText("Available now until 2:00 PM");
    await expect(page.getByText("Check-in for the 2:00 PM booking opens at 1:50 PM.")).toBeVisible();

    await page.goto(booking.url);
    await page.getByLabel("Room code").fill(codeFrom(room.id, 0));
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("Check-in opens at 1:50 PM.");
    await expect(page.getByRole("heading", { name: "Your room is booked" })).toBeVisible();

    await setLibraryTime(staff, day, "14:05", "2:05 PM");
    const doorCode = await readDoorCode(page, room.token);
    await expect(page.getByTestId("door-status")).toContainText("Booked - awaiting check-in");
    await page.goto(booking.url);
    await page.getByLabel("Room code").fill(doorCode);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("You are checked in. The room is yours until 3:00 PM.");
    await expect(page.getByRole("heading", { name: "You are checked in" })).toBeVisible();

    await expect(await boardCard(staff, "Study Room B", "2:00-3:00 PM")).toContainText("Checked in");
    await page.goto(`/door/${room.token}`);
    await expect(page.getByTestId("door-status")).toContainText("In use until 3:00 PM");
    await staff.close();
  });

  test("scenarios 3 and 6 at the door: QR link plus booking code", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo("Study Room C");
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const booking = await patronBooks(page, "Study Room C", "2:00 PM", "1 hour");

    await setLibraryTime(staff, day, "13:30", "1:30 PM");
    await page.goto(`/r/${room.token}?code=${codeFrom(room.id, 0)}`);
    const haveBooking = page.getByRole("region", { name: "Have a booking? Check in" });
    await haveBooking.getByLabel("Booking code or last 4 digits of your library card").fill(booking.bookingCode);
    await haveBooking.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("Check-in opens at 1:50 PM.");

    await setLibraryTime(staff, day, "14:05", "2:05 PM");
    const doorCode = await readDoorCode(page, room.token);
    await page.goto(`/r/${room.token}?code=${doorCode}`);
    await expect(page.getByTestId("room-status")).toContainText("Booked - awaiting check-in");
    await page.getByLabel("Booking code or last 4 digits of your library card").fill("2468");
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("You are checked in. Study Room C is yours until 3:00 PM.");

    await expect(await boardCard(staff, "Study Room C", "2:00-3:00 PM")).toContainText("Checked in");
    await staff.close();
  });

  test("scenarios 4 and 5: a no-show is released everywhere and a walk-in books it until the next booking", async ({
    page,
    browser,
  }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo("Study Room D");
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const noShow = await patronBooks(page, "Study Room D", "2:00 PM", "1 hour");
    await patronBooks(page, "Study Room D", "4:00 PM", "1 hour", "1357");

    await setLibraryTime(staff, day, "14:16", "2:16 PM");
    await expect(await boardCard(staff, "Study Room D", "2:00-3:00 PM")).toHaveCount(0);

    await page.goto("/book");
    await expect(page.getByRole("link", { name: /Study Room D/ })).toContainText("Free now until 4:00 PM");
    await page.goto(noShow.url);
    await expect(page.getByText("This booking was released because nobody checked in.")).toBeVisible();

    await page.goto(`/door/${room.token}`);
    await expect(page.getByTestId("door-status")).toContainText("Available now until 4:00 PM");

    await page.goto(`/r/${room.token}?code=${codeFrom(room.id, 0)}`);
    await expect(page.getByTestId("room-status")).toContainText("Available now until 4:00 PM");
    const haveBooking = page.getByRole("region", { name: "Have a booking? Check in" });
    await haveBooking.getByLabel("Booking code or last 4 digits of your library card").fill(noShow.bookingCode);
    await haveBooking.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("This booking was released - nobody checked in by 2:15 PM.");

    const walkIn = page.getByRole("region", { name: "Use this room now until 4:00 PM" });
    await walkIn.getByLabel("Your name").fill("Walk In");
    await walkIn.getByLabel("Last 4 digits of your library card").fill("9753");
    await walkIn.getByLabel("How many people?").fill("2");
    await walkIn.getByRole("button", { name: "Book now until 4:00 PM" }).click();
    await expect(page.getByRole("status")).toContainText("You are checked in. Study Room D is yours until 4:00 PM.");

    await expect(await boardCard(staff, "Study Room D", "2:16-4:00 PM")).toContainText("Checked in");
    await staff.close();
  });

  test("an expired room code is rejected on the booking page and at the door", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo("Birch Meeting Room");
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const booking = await patronBooks(page, "Birch Meeting Room", "2:00 PM", "1 hour");
    await setLibraryTime(staff, day, "14:05", "2:05 PM");
    const expired = codeFrom(room.id, 3);

    await page.goto(booking.url);
    await page.getByLabel("Room code").fill(expired);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That code has changed or is not right." })).toBeVisible();
    await expect(page.getByLabel("Room code")).toBeFocused();

    await page.goto(`/r/${room.token}?code=${expired}`);
    await page.getByLabel("Booking code or last 4 digits of your library card").fill(booking.bookingCode);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That code has changed. Scan the code" })).toBeVisible();

    await expect(await boardCard(staff, "Birch Meeting Room", "2:00-3:00 PM")).toContainText("awaiting check-in");
    await staff.close();
  });

  test("five wrong codes pause check-in for that booking, even with the right code", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo("Community Room");
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const booking = await patronBooks(page, "Community Room", "2:00 PM", "1 hour");
    await setLibraryTime(staff, day, "14:05", "2:05 PM");
    await page.goto(booking.url);

    const field = page.getByLabel("Room code");
    for (let i = 0; i < 4; i++) {
      await field.fill(codeFrom(room.id, 5 + i));
      await page.getByRole("button", { name: "Check in" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "That code has changed or is not right." })).toBeVisible();
    }
    await field.fill(codeFrom(room.id, 20));
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("Check-in is paused after too many wrong codes.");

    await field.fill(codeFrom(room.id, 0));
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("status")).toContainText("Check-in is paused");
    await expect(await boardCard(staff, "Community Room", "2:00-3:00 PM")).toContainText("awaiting check-in");
    await staff.close();
  });

  test("scenario 8: check-in pages are accessible and keyboard-reachable", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    const room = await roomInfo("Oak Meeting Room");
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const booking = await patronBooks(page, "Oak Meeting Room", "2:00 PM", "1 hour");
    await setLibraryTime(staff, day, "13:55", "1:55 PM");

    await page.goto(`/r/${room.token}?code=${codeFrom(room.id, 0)}`);
    await expect(page.getByTestId("room-status")).toContainText("Booked - awaiting check-in");
    await expectNoAxeViolations(page);
    const identifier = page.getByLabel("Booking code or last 4 digits of your library card");
    await tabTo(page, identifier);
    await page.keyboard.type(booking.bookingCode);
    await tabTo(page, page.getByRole("button", { name: "Check in" }));
    await page.keyboard.press("Enter");
    const status = page.getByRole("status");
    await expect(status).toContainText("You are checked in.");
    await expect(status).toBeFocused();
    await expectNoAxeViolations(page);

    await page.goto(booking.url);
    await expect(page.getByRole("heading", { name: "You are checked in" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(`/r/${(await roomInfo("Creekside Room")).token}`);
    await expect(page.getByText("Scan the code on the room's door display, or type the code shown there.")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(`/door/${room.token}`);
    await expect(page.getByTestId("door-code")).toBeVisible();
    await expectNoAxeViolations(page);
    await staff.close();
  });

  test("scenario 8: the booking page check-in form passes axe", async ({ page, browser }) => {
    const staff = await staffPage(browser);
    const day = freshWeekday();
    await setLibraryTime(staff, day, "10:00", "10:00 AM");
    const booking = await patronBooks(page, "Study Room A", "2:00 PM", "1 hour");
    await page.goto(booking.url);
    await tabTo(page, page.getByLabel("Room code"));
    await expectNoAxeViolations(page);
    await staff.close();
  });
});
