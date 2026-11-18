"use server";

import { doorCode, loadRoomByToken, requestOrigin, type DoorCode } from "@/lib/server/checkin";

export type DoorCodeResult = ({ success: true } & DoorCode) | { success: false; error: string };

/** The room's current code and QR for its door display. */
export async function getDoorCode(roomToken: string): Promise<DoorCodeResult> {
  try {
    const room = await loadRoomByToken(String(roomToken));
    if (!room) return { success: false, error: "This door display link is not valid." };
    return { success: true, ...(await doorCode(room, await requestOrigin())) };
  } catch (error) {
    console.error(error);
    return { success: false, error: "Reconnecting..." };
  }
}
