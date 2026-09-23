import type { ScenarioClientTag } from "../types";

/** Native 0184 entry9 (wrapper80B08009 -> payload80B08029).
 * Header+4/+8/+C checksums; +2C count30; rows+60 have four empty bubbles.
 */
export const tag: ScenarioClientTag = {
  activityName: "venus_portal_1",
  bubbleCount: 30,
  class: 0x808008a4,
  emptyBubbles: [11, 15, 20, 22],
  familyChecksum: 0xa8ead84d,
  privateChecksum: 0xc9b690c7,
  publicChecksum: 0xf47a9130,
  tag: 0x80b08009,
};
