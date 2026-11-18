import { createClient } from "@supabase/supabase-js";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { checkinCode } from "../lib/checkin-code";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may already be in the environment (CI).
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; browser tests read it from .env.local.`);
  return value;
}

/** A room's id and door token, read with the server key (tests only). */
export async function roomInfo(name: string): Promise<{ id: string; token: string }> {
  const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await db.from("room").select("id, qr_token").eq("name", name).single();
  if (error) throw new Error(`Room ${name}: ${error.message}`);
  return { id: data.id as string, token: data.qr_token as string };
}

/** The room code from `minutesAgo` real minutes back; 3 or more is outside the grace minute. */
export function codeFrom(roomId: string, minutesAgo: number): string {
  return checkinCode(env("CHECKIN_CODE_SECRET"), roomId, Date.now() - minutesAgo * 60_000);
}

export async function staffPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

export async function setLibraryTime(staff: Page, date: string, time: string, label: string): Promise<void> {
  await staff.goto("/");
  await staff.getByRole("button", { name: "Set time" }).click();
  const dialog = staff.getByRole("dialog", { name: "Set library time" });
  await dialog.getByLabel("Date").fill(date);
  await dialog.getByLabel("Time").fill(time);
  await dialog.getByRole("button", { name: "Set time" }).click();
  await expect(staff.getByTestId("library-time")).toContainText(label);
}

/** A random weekday far in the future, so each test has its own empty day. */
export function freshWeekday(): string {
  const year = 2030 + Math.floor(Math.random() * 40);
  let day = new Date(Date.UTC(year, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() + 86_400_000);
  return day.toISOString().slice(0, 10);
}

/** Books a room from the patron site and returns the booking page URL and booking code. */
export async function patronBooks(
  page: Page,
  room: string,
  start: string,
  length: string,
  card = "2468",
): Promise<{ url: string; bookingCode: string }> {
  await page.goto("/book");
  await page.getByRole("link", { name: new RegExp(room) }).click();
  await expect(page.getByRole("heading", { level: 1, name: room })).toBeVisible();
  await page.getByRole("link", { name: start, exact: true }).click();
  await page.getByRole("link", { name: new RegExp(`^${length}\\s*\\d{1,2}:`) }).click();
  await page.getByLabel("Your name").fill("Door Patron");
  await page.getByLabel("Last 4 digits of your library card").fill(card);
  await page.getByLabel("How many people?").fill("2");
  await page.getByRole("button", { name: "Book this room" }).click();
  await expect(page.getByRole("heading", { name: "Your room is booked" })).toBeVisible();
  const bookingCode = (await page.getByText(/^[A-HJ-NP-Z2-9]{6}$/).textContent())!.trim();
  return { url: page.url(), bookingCode };
}

/** The code currently shown on the room's door display. */
export async function readDoorCode(page: Page, token: string): Promise<string> {
  await page.goto(`/door/${token}`);
  const code = page.getByTestId("door-code");
  await expect(code).toHaveAttribute("data-code", /^\d{6}$/);
  return (await code.getAttribute("data-code"))!;
}

/** Tabs forward until `target` has focus, proving it is keyboard-reachable. */
export async function tabTo(page: Page, target: Locator, maxTabs = 30): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("Element was not reachable with the Tab key.");
}
