import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const httpSend = vi.fn();
const channel = { httpSend };
const db = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => "ok") };
vi.mock("@/lib/server/supabase", () => ({ supabaseAdmin: () => db }));

const { notifyChange } = await import("@/lib/server/live");

describe("notifyChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends an empty changed ping on the library channel and removes the channel", async () => {
    httpSend.mockResolvedValue({ success: true });
    await notifyChange();
    expect(db.channel).toHaveBeenCalledWith("library-changes");
    expect(httpSend).toHaveBeenCalledWith("changed", {});
    expect(db.removeChannel).toHaveBeenCalledWith(channel);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs a failed send without rejecting", async () => {
    httpSend.mockResolvedValue({ success: false, status: 500, error: "down" });
    await expect(notifyChange()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
    expect(db.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("logs a thrown error without rejecting", async () => {
    httpSend.mockRejectedValue(new Error("network"));
    await expect(notifyChange()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
    expect(db.removeChannel).toHaveBeenCalledWith(channel);
  });
});
