import { decode } from "@blamnetwork/rsat";
import { describe, expect, it } from "vitest";
import { VenusStrikeFirstWave } from "./venus-strike-first-wave";
import { buildVenusStrikeFirstWaveSquadEntry, buildVenusStrikeEngineeringTask, buildVenusStrikeCombatObjective } from "./rsat/mocks/sensor-auth";
import { SquadAuth, SquadSense, ObjectiveSense, PlayerObjectiveAuth } from "./rsat/schemas/sensor";

describe("authored Engineering first wave staging", () => {
  it("activates only the first wildcard task and uses the authored zero-of-four objective", () => {
    const entry = buildVenusStrikeEngineeringTask(4);
    expect(decode(ObjectiveSense, entry.authBody!).table.values.slice(0,6)).toEqual([0,0,0,0,1,0]);
    expect(entry.senseBody).toBeDefined();
    expect(buildVenusStrikeEngineeringTask(4, false).senseBody).toBeUndefined();
    const objective = buildVenusStrikeCombatObjective(27,1);
    expect(objective.clientRef.bundle).toBe(0x0a302429);
    const state = decode(PlayerObjectiveAuth,objective.authBody!);
    expect([state.unk0,state.unk5,state.unk6]).toEqual([1,0,4]);
  });
  it.each([[0, 3000], [0.25, 4000], [0.5, 5000], [0.999, 6000]])("uses native inclusive integer delay for roll %s", (roll, delay) => {
    const wave = new VenusStrikeFirstWave();
    expect(wave.begin(100, () => roll)).toEqual({ squad: 2, delayMs: delay });
    expect(wave.begin(100, () => roll)).toBeUndefined();
    expect(wave.takeSecond(99 + delay, "venus_portal_1", 7)).toBeUndefined();
    expect(wave.takeSecond(100 + delay, "venus_portal_1", 7)).toBe(3);
    expect(wave.takeSecond(101 + delay, "venus_portal_1", 7)).toBeUndefined();
  });
  it.each([["venus_portal_1", 16], ["venus_bounty_1", 7]])("cancels pending spawn when context changes to %s/%s", (activity, slice) => {
    const wave = new VenusStrikeFirstWave();
    wave.begin(0, () => 0);
    expect(wave.takeSecond(3000, activity, slice)).toBeUndefined();
    expect(wave.takeSecond(3000, "venus_portal_1", 7)).toBeUndefined();
  });
  it.each([2, 3] as const)("encodes Squad%s authored roster/group without guessing a firing area", (squad) => {
    const entry = buildVenusStrikeFirstWaveSquadEntry(squad);
    const auth = decode(SquadAuth, entry.authBody!);
    const sense = decode(SquadSense, entry.senseBody!);
    expect(entry.clientRef).toEqual({ bundle: 0x0a302429, typeId: 1, typeIndex: squad });
    expect(auth.roster.slots).toEqual([3, 3]);
    expect(auth.ref0).toEqual({ bundle: 0x0a302429, typeId: 42, typeIndex: 165 });
    expect(auth.ref1).toBeUndefined();
    expect(sense.roster.slots).toEqual([3, 3]);
    expect(entry.nativeBodyFraming).toBe(true);
  });
});
