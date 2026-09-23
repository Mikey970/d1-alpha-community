import { BitReader } from "@blamnetwork/rsat";
import { SensorClientRef } from "./rsat/schemas/sensor";

/**
 * Native PlayerTrigger835B85B0 emits DD6D986F. The r373/r394 capture form is
 * one50-byte incident with SensorClientRef at bit310 and a fallback-name hash.
 * Strike client80B08925 (0184/2341) identifies0A302429/type29/index74, owner7,
 * targeting Location162. Neighbor trigger73 targets TriggerVolume184 instead.
 *
 * This is a narrow matcher for that existing wire form, not runtime proof of
 * strike arrival. The caller must pass its actual current activity and bubble.
 * PlayerTriggerAuth.flag enables the native tick; a fresh sequence0 is newer
 * than initial last-fired=-1. It does not bypass the native Location test.
 */
export function isVenusStrikeEngineeringEntryIncident(
  payload: Buffer,
  activityName: string,
  currentSlice: number
): boolean {
  if (activityName !== "venus_portal_1" || currentSlice !== 7 || payload.length !== 50) {
    return false;
  }
  try {
    const reader = new BitReader(payload);
    if (reader.readNumber(4) !== 1 ||
        (reader.readNumber(32) >>> 0) !== 0xdd6d986f) return false;
    while (reader.bitPos < 310) reader.readBit();
    const ref = SensorClientRef.decode(reader);
    return (ref.bundle >>> 0) === 0x0a302429 &&
      ref.typeId === 29 && ref.typeIndex === 74 &&
      (reader.readNumber(32) >>> 0) === 0x811c9dc5 &&
      reader.readNumber(4) === 0;
  } catch {
    return false;
  }
}
