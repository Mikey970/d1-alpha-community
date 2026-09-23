import { describe, expect, it } from "vitest";
import { effectiveActivityId } from "./activity-override";

describe("effectiveActivityId", () => {
  it("preserves distinct Director selections even with a retained override", () => {
    for (const id of [0, 2, 3, 4, 5, 6, 7, 55, 245]) {
      expect(effectiveActivityId(id, "4", "director")).toBe(id);
      expect(effectiveActivityId(id, "4", "")).toBe(id);
    }
  });

  it("requires explicit diagnostic mode and a known override", () => {
    expect(effectiveActivityId(5, "7", "override")).toBe(7);
    expect(effectiveActivityId(5, "8", "override")).toBe(5);
    expect(effectiveActivityId(5, "not-an-id", "override")).toBe(5);
    expect(effectiveActivityId(5, "", "override")).toBe(5);
  });
});
