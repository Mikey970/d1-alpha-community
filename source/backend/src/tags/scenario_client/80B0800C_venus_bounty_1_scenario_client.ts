import type { ScenarioClientTag } from "../types";

/** Native 0184 entry12 (wrapper80B0800C -> payload80B08045).
 * Header+4/+8/+C checksums; +2C count30; twelve-byte rows at+60.
 */
export const tag: ScenarioClientTag = {
  activityName: "venus_bounty_1",
  bubbleCount: 30,
  class: 0x808008a4,
  emptyBubbles: [11, 15, 20, 22],
  familyChecksum: 0x20c3f9ea,
  privateChecksum: 0x63194e8f,
  publicChecksum: 0xf47a9130,
  tag: 0x80b0800c,
};
