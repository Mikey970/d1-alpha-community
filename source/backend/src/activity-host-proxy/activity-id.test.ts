import { describe, expect, it } from "vitest";
import { activityNameForId, activityRouteForId, activityRouteForStart } from "./activity-id";

describe("OWC activity id → package symbol", () => {
  it.each([8, 9])("resolves playlist %s through all three equally weighted native maps", (id) => {
    expect(activityRouteForStart(id, () => 0)?.activityId).toBe(5);
    expect(activityRouteForStart(id, () => 0.5)?.activityId).toBe(6);
    expect(activityRouteForStart(id, () => 0.999999)?.activityId).toBe(7);
    expect(activityRouteForStart(55, () => { throw new Error("not a playlist"); })?.activityId).toBe(55);
    expect(activityRouteForStart(32767)).toBeUndefined();
  });
  it("uses the first activity C-string in 808E2757+id", () => {
    expect(activityNameForId(0)).toBe("city_tower_default1");
    expect(activityNameForId(1)).toBe("action_mock");
    expect(activityNameForId(2)).toBe("venus_chapter_2");
    expect(activityNameForId(7)).toBe("pvp_marsbattle");
    expect(activityNameForId(10)).toBe("city_tower_default1");
    expect(activityNameForId(11)).toBe("cinematic_osiris_default1");
    expect(activityNameForId(16)).toBe("mars_bounty_1");
    expect(activityNameForId(245)).toBe("cosmo_chapter_1");
  });

  it("leaves holes when the def has no activity name", () => {
    expect(activityNameForId(8)).toBeUndefined();
    expect(activityNameForId(9)).toBeUndefined();
    expect(activityNameForId(13)).toBeUndefined();
    expect(activityNameForId(294)).toBeUndefined();
  });

  it("preserves native variants and rejects destinations without decoded routing", () => {
    expect(activityRouteForId(4)?.activityName).toBe("venus_portal_1");
    expect(activityRouteForId(55)?.activityId).toBe(55);
    expect(activityRouteForId(55)?.scenario.tag).toBe(activityRouteForId(4)?.scenario.tag);
    expect(activityRouteForId(0)?.activityName).toBe("city_tower_default1");
    expect(activityRouteForId(5)?.activityName).toBe("pvp_factory");
    expect(activityRouteForId(3)?.activityName).toBe("venus_bounty_1");
    expect(activityRouteForId(245)).toBeUndefined();
    expect(activityRouteForId(8)).toBeUndefined();
  });
});
