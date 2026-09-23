import { ACTIVITY_ID_NAMES } from "../tags";
import { scenarioClient } from "./scenario-client";

export { ACTIVITY_ID_NAMES } from "../tags";

export function activityNameForId(activityId: number): string | undefined {
  return ACTIVITY_ID_NAMES[activityId];
}

/** Native ID plus currently decoded client routing; not gameplay acceptance. */
export function activityRouteForId(activityId: number) {
  const activityName = activityNameForId(activityId);
  const scenario = activityName === undefined ? undefined : scenarioClient(activityName);
  if (!scenario) return undefined;
  // Keep the selected variant ID: multiple native nodes can share a scenario
  // while retaining different difficulty, rewards and authored options.
  return { activityId, activityName: scenario.activityName, scenario };
}

// Native 808018BE records 1887/1888 (808E275F/808E2760): both
// 808018AC playlists contain 808018A9 children 5, 6, 7, each weight 1.
// Playlists have no scenario of their own; the host selects a child once.
const PLAYLIST_CHILDREN: Readonly<Record<number, readonly number[]>> = {
  8: [5, 6, 7],
  9: [5, 6, 7],
};

export function activityRouteForStart(activityId: number, random = Math.random) {
  const children = PLAYLIST_CHILDREN[activityId];
  return activityRouteForId(children
    ? children[Math.floor(random() * children.length)]
    : activityId);
}
