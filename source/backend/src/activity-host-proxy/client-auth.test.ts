import { describe, expect, it } from "vitest";
import { parseClientAuth } from "./client-auth";

describe("native client-auth captures", () => {
  it("distinguishes the r345 requested and completed transaction", () => {
    const requested = parseClientAuth(Buffer.from("8b0180000040811c9dc500000800005660", "hex"));
    expect(requested?.teleport).toEqual({state: 2,
      request: {a: 1, b: 64, c: 0x811c9dc5, d: 0}, startTime: 1382});
    const completed = parseClientAuth(Buffer.from("a1009600c0000020408e4ee280000400002b30", "hex"));
    expect(completed?.teleport).toEqual({...requested?.teleport, state: 3});
    expect(completed?.transition?.state).toBe(0);
  });
  it("rejects nonzero trailing data instead of acknowledging it", () => {
    expect(() => parseClientAuth(Buffer.from("a1009600c0000020408e4ee280000400002b31", "hex"))).toThrow();
  });
});
