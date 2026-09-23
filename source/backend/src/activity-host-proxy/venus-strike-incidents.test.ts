import { describe, expect, it } from "vitest";
import { isVenusStrikeEngineeringEntryIncident } from "./venus-strike-incidents";

// Actual r373 Headlands137 capture. Positive strike cases below substitute
// only the documented54-bit native ref; they are synthetic, not strike proof.
const capturedHeadlands = Buffer.from(
  "1dd6d986f1600001a7e2000000020000000200000002000000020f46800000000000061d9c803145d907c5e8089811c9dc50",
  "hex"
);

function withBits(payload: Buffer, start: number, length: number, value: number): Buffer {
  const result = Buffer.from(payload);
  for (let i = 0; i < length; i++) {
    const bit = start + i;
    const mask = 1 << (7 - (bit % 8));
    const set = ((value >>> (length - i - 1)) & 1) !== 0;
    result[bit >>> 3] = set ? result[bit >>> 3] | mask : result[bit >>> 3] & ~mask;
  }
  return result;
}

function strikeVariant(index = 74): Buffer {
  let payload = withBits(capturedHeadlands, 310, 32, 0x0a302429);
  payload = withBits(payload, 342, 6, 29 + 1);
  return withBits(payload, 348, 16, index + 0x8000);
}

const matches = (payload: Buffer) =>
  isVenusStrikeEngineeringEntryIncident(payload, "venus_portal_1", 7);

describe("native Engineering arrival incident identity", () => {
  it("accepts the authored Location-trigger74 wire variant only in strike Engineering", () => {
    const event = strikeVariant();
    expect(matches(event)).toBe(true);
    expect(isVenusStrikeEngineeringEntryIncident(event, "venus_chapter_2", 7)).toBe(false);
    expect(isVenusStrikeEngineeringEntryIncident(event, "venus_bounty_1", 7)).toBe(false);
    for (const slice of [5, 16, 28, -1, Number.NaN]) {
      expect(isVenusStrikeEngineeringEntryIncident(event, "venus_portal_1", slice)).toBe(false);
    }
  });

  it("rejects adjacent triggers, other missions, and another sensor type", () => {
    expect(matches(capturedHeadlands)).toBe(false);
    for (const index of [73, 75, 76, 77, 82, 83, 137, 147, 153]) {
      expect(matches(strikeVariant(index))).toBe(false);
    }
    expect(matches(withBits(strikeVariant(), 310, 32, 0x517641f1))).toBe(false);
    expect(matches(withBits(strikeVariant(), 342, 6, 54 + 1))).toBe(false);
  });

  it("rejects truncated, extended, batched, corrupt and differently named forms", () => {
    const event = strikeVariant();
    expect(matches(event.subarray(0, 49))).toBe(false);
    expect(matches(Buffer.concat([event, Buffer.from([0])]))).toBe(false);
    expect(matches(Buffer.concat([event, event]))).toBe(false);
    expect(matches(withBits(event, 0, 4, 2))).toBe(false);
    expect(matches(withBits(event, 4, 32, 0xdd6d986e))).toBe(false);
    expect(matches(withBits(event, 364, 32, 0x37ba5fcd))).toBe(false);
    expect(matches(withBits(event, 396, 4, 1))).toBe(false);
  });
});
