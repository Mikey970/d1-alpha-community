import { parseClientAuth } from './client-auth';
import { scenarioClient } from './scenario-client';

/** Actual boundary requests include r434 Dig Site kind15/state1 and kind16/state4.
 * The kind byte varies across requests; it is not a fixed destination/state enum.
 * Respond with destination assignment; the client's refresh confirms arrival.
 * This never emits a teleport, changes an objective or declares a kill.
 */
export function requestedStrikeBubble(
  auth: ReturnType<typeof parseClientAuth>, activityName: string, currentSlice: number | undefined,
): number | undefined {
  if (activityName !== 'venus_portal_1' || currentSlice === undefined) return;
  return requestedVenusBubble(auth, activityName, currentSlice);
}

/** Chapter 2 uses the same world/region descriptors as the strike. r537
 * captured real boundary requests to 21 and 16 that the strike-only handler
 * ignored. Assignment preserves the client's insertion and physical movement.
 */
export function requestedChapter2Bubble(
  auth: ReturnType<typeof parseClientAuth>, activityName: string, currentSlice: number | undefined,
): number | undefined {
  if (activityName !== 'venus_chapter_2' || currentSlice === undefined) return;
  return requestedVenusBubble(auth, activityName, currentSlice);
}

function requestedVenusBubble(
  auth: ReturnType<typeof parseClientAuth>, activityName: string, currentSlice: number,
): number | undefined {
  const transition = auth?.transition;
  const request = transition?.requested;
  if (!request || request.destination < 0 ||
      request.secondaryDestination !== request.destination || request.state !== 0 ||
      request.token !== 0 ||
      !Number.isInteger(transition?.kind) || transition!.kind! < 1 || transition!.kind! > 255 ||
      ![1, 2, 3, 4].includes(transition?.state ?? -1)) return;
  // 83619EB0/83619ED8: physical bubble and option selector, not logical set ID.
  const bubble = request.destination >>> 3;
  const scenario = scenarioClient(activityName)!;
  if ((request.destination & 7) !== 0 || bubble >= scenario.bubbleCount ||
      scenario.emptyBubbles?.includes(bubble) || bubble === currentSlice) return;
  return bubble;
}
