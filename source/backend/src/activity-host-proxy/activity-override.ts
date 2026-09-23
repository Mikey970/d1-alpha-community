import { ACTIVITY_ID_NAMES } from "./activity-id";

export function effectiveActivityId(
  clientActivityId: number,
  rawOverride = process.env.D1A_ACTIVITY_OVERRIDE_ID,
  routing = process.env.D1A_ACTIVITY_ROUTING
): number {
  // Director selections are authoritative during normal play. A retained
  // single-activity diagnostic override must not silently redirect every node.
  if (routing?.trim() !== "override") return clientActivityId;
  const value = rawOverride?.trim();
  if (!value) {
    return clientActivityId;
  }

  const override = Number(value);
  return Number.isInteger(override) && ACTIVITY_ID_NAMES[override] !== undefined
    ? override
    : clientActivityId;
}
