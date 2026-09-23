import { BitReader, decode } from "@blamnetwork/rsat";
import { describe, expect, it } from "vitest";
import actionRegistry from './action-registry-r549.fixture.json';
import { activityBundleForSlice } from "../../../tags/activity_bundle";
import { tag as actionMock } from "../../../tags/activity_bundle/80A8A007_action_mock_f7bd8718";
import { tag as venusHub } from "../../../tags/activity_bundle/809B800D_venus_bounty_1_517641f1";
import { tag as venusPlayers } from "../../../tags/activity_bundle/809B801B_venus_bounty_1_eaaf16e2";
import { tag as towerPlaza } from "../../../tags/activity_bundle/809E200B_city_tower_default1_8cc31436";
import { tag as towerUnderwatch } from "../../../tags/activity_bundle/809E200C_city_tower_default1_aa891b91";
import { tag as towerStory } from "../../../tags/activity_bundle/809E2008_city_tower_default1_4786c0e0";
import { tag as towerFah } from "../../../tags/scenario_fah/809E2004_city_tower_default1_scenario_fah";
import { ActivityBundleItemType } from "../../../tags/types";
import {
  CinematicAuth,
  HardWipeGlobalsAuth,
  HealthAuth,
  LifetimeAuth,
  LootAuth,
  ObjectiveAuth,
  ObjectiveSense,
  PlayerAuth,
  PlayerMonitorSense,
  PlayerObjectiveAuth,
  PlayerTriggerAuth,
  SensorClientRef,
  SequenceAuth,
  SquadAuth,
  SquadSense,
} from "../schemas/sensor";
import {
  buildActionMockObjectiveActivationSenseEntries,
  buildActionMockSquadActivationSenseEntries,
  buildSensorAuthTickRsat,
  buildTowerApplySenseEntries,
  buildTowerBinderSenseEntries,
  buildTowerLeftoverSenseEntries,
  buildTowerPostmasterActivationSenseEntries,
  buildTowerSensorAuthRsat,
  buildTowerVendorActivationSenseEntries,
  buildVenusVexActivationSenseEntries,
  buildVenusVexObjectiveActivationSenseEntries,
  buildVenusVexPlayerMonitorReceivedSenseEntries,
  buildVenusVexSquadActivationSenseEntries,
  buildVenusOpeningObjectiveEntry,
  buildVenusCaptainFollowupEntries,
  buildVenusCaptainActivationEntries,
  buildVenusHeadlandsArrivalEntries,
  buildVenusFluidsEncounterEntries,
  encodeCinematicAuth,
  encodeFireteamAuth,
  encodeHardWipeGlobalsAuth,
  encodeHealthAuth,
  encodeLifetimeAuth,
  encodeLootAuth,
  encodeObjectAuth,
  encodeObjectFilterAuth,
  encodeObjectiveActivationAuth,
  encodeObjectiveAuth,
  encodeObjectiveReceivedState,
  encodePlayerAuth,
  encodePlayerMonitorAuth,
  encodePlayerMonitorSense,
  encodePlayerObjectiveAuth,
  encodePlayerTriggerAuth,
  encodeSafeZoneAuth,
  encodeScoreboardAuth,
  encodeSensorClientRef,
  encodeSequenceAuth,
  encodeSquadAuth,
  encodeSquadSense,
  encodeTimerAuth,
  playerKeyFromCharacter,
  senseEntryPayloadBits,
} from "./sensor-auth";

it('activates the Headlands Vex population and native loot without inventing pickups', () => {
  const entries = buildVenusFluidsEncounterEntries();
  const squads = entries.filter(e => e.clientRef.typeId === ActivityBundleItemType.Squad);
  // Independent host-file audit: 00dc/180 populations at 318C0/31B20/31D80/31FE0.
  expect(squads.map(squad => {
    const auth = decode(SquadAuth, squad.authBody!);
    expect(squad.clientRef.bundle).toBe(0xb9d50318);
    expect(auth.ref0.typeId).toBe(42);
    expect(auth.ref1.typeId).toBe(41);
    return [squad.clientRef.typeIndex, auth.roster.slots, auth.ref0.typeIndex, auth.ref1.typeIndex];
  })).toEqual([[24, [4], 169, 140], [26, [4], 172, 148],
    [28, [2], 175, 164], [30, [1], 178, 173]]);
  const loot = entries.find(e => e.clientRef.typeId === ActivityBundleItemType.Loot)!;
  const lootAuth = decode(LootAuth, loot.authBody!);
  expect(lootAuth.flag).toBe(true);
  expect(lootAuth.unk).toBe(0);
  expect(decode(LootAuth, encodeLootAuth().bytes).flag).toBe(false);
});

const storyPlayers = towerStory.rows.filter(
  (row) => row.typeId === ActivityBundleItemType.Player
);
const storyLifetime = towerStory.rows.find(
  (row) => row.typeId === ActivityBundleItemType.Lifetime
)!;
const plazaSquads = towerPlaza.rows.filter(
  (row) => row.typeId === ActivityBundleItemType.Squad
);
const plazaActors = towerPlaza.rows.filter(
  (row) => row.typeId === ActivityBundleItemType.Actor
);
const occupiedPlayer = storyPlayers[0]!;

it("encodes the packaged Venus opening objective with active state and correct signed defaults", () => {
  const entry = buildVenusOpeningObjectiveEntry();
  expect(entry.clientRef).toEqual({ bundle: 0x517641f1, typeId: 32, typeIndex: 7 });
  expect(entry.nativeBodyFraming).toBe(true);
  expect(senseEntryPayloadBits(entry).slice(0, 2)).toEqual([1, 1]);
  const value = decode(PlayerObjectiveAuth, entry.authBody!);
  expect(value.unk0).toBe(1);
  expect(value.unk5).toBe(0);
  expect(value.unk6).toBe(0);
  expect(value.options.windowOpen).toBe(-0x80000000);
  expect(value.options.windowClose).toBe(0x7fffffff);
  expect(value.slots.slots[0].unk0).toBe(1);
  expect(value.slots.slots[0].ref).toMatchObject({bundle:0x44fb7aa2,typeId:2,typeIndex:2});
  expect(value.slots.slots.slice(1).every((slot) => slot.unk0 === 0 && slot.unk3 === 0)).toBe(true);
});

it("retires the Captain prompt before activating the authored phase01 objective", () => {
  const before = buildVenusCaptainActivationEntries().find(e => e.clientRef.typeId === 32)!;
  expect(before.clientRef.typeIndex).toBe(7);
  expect(decode(PlayerObjectiveAuth, before.authBody!).unk0).toBe(1);
  const after = buildVenusCaptainFollowupEntries();
  expect(after.map(e => [e.clientRef.bundle, e.clientRef.typeId, e.clientRef.typeIndex,
    decode(PlayerObjectiveAuth, e.authBody!).unk0])).toEqual([
      [0x517641f1, 32, 7, 0], [0x517641f1, 32, 18, 1],
    ]);
  expect(after.every(e => e.nativeBodyFraming && !e.senseBody)).toBe(true);
});

describe("SensorAuth RSAT", () => {
  it("matches Headlands roster lengths captured from the native squad registry", () => {
    const squads = buildTowerApplySenseEntries(0x200000002n, 10, 'venus_chapter_2')
      .filter(e => e.clientRef.bundle === 0xb9d50318 && e.clientRef.typeId === 1);
    const expected = new Map([[71,2], [72,2], [73,3], [74,3], [75,3], [76,3], [77,3], [78,3]]);
    expect(squads.length).toBe(24);
    for (const squad of squads) {
      const roster = decode(SquadAuth, squad.authBody!).roster!.slots;
      expect(roster.length).toBe(expected.get(squad.clientRef.typeIndex) ?? 1);
      expect(roster.every(slot => slot === 0)).toBe(true);
    }
  });
  it("initializes the observed Headlands pending family without activating local objectives or dialogue", () => {
    const entries = buildVenusHeadlandsArrivalEntries();
    expect(entries.every(e => !e.nativeBodyFraming && !e.senseBody)).toBe(true);
    const triggers = entries.filter(e => e.clientRef.typeId === 29);
    expect(triggers.map(e => [e.clientRef.bundle, e.clientRef.typeIndex,
      decode(PlayerTriggerAuth, e.authBody!).flag])).toEqual([
      [0x517641f1,135,false], [0x517641f1,136,false], [0x517641f1,137,true],
      [0xb9d50318,98,false], [0xb9d50318,100,false],
    ]);
    const defaults = entries.filter(e => e.clientRef.bundle === 0xb9d50318 && e.clientRef.typeId !== 29);
    expect(defaults.length).toBe(15);
    expect(defaults.every(e => senseEntryPayloadBits(e).join('') === '10')).toBe(true);
    expect(entries.filter(e => e.authBody).every(e =>
      senseEntryPayloadBits(e).slice(0,2).join('') === '11')).toBe(true);
    const objective = entries.at(-1)!;
    expect(objective.clientRef.typeIndex).toBe(18);
    expect(decode(PlayerObjectiveAuth, objective.authBody!).unk0).toBe(1);
  });
  it("acknowledges the three Headlands-owned trigger rows only in their native area", () => {
    const triggers = (slice: number) => buildTowerApplySenseEntries(0x200000002n, slice, 'venus_chapter_2')
      .filter(e => e.clientRef.bundle === 0x517641f1 && e.clientRef.typeId === 29 &&
        [135, 136, 137].includes(e.clientRef.typeIndex));
    expect(triggers(10).map(e => e.clientRef.typeIndex)).toEqual([135, 136, 137]);
    expect(triggers(8)).toEqual([]);
    expect(triggers(10).every(e => e.nativeBodyFraming &&
      decode(PlayerTriggerAuth, e.authBody!).flag === false)).toBe(true);
  });

  it("encodes 8080046B as 54 bits", () => {
    const bits = encodeSensorClientRef({
      bundle: towerStory.bundle,
      typeId: ActivityBundleItemType.Player,
      typeIndex: occupiedPlayer.typeIndex,
    });
    expect(bits.bitCount).toBe(54);
    const parsed = decode(SensorClientRef, bits.bytes);
    expect(parsed.bundle >>> 0).toBe(towerStory.bundle);
    expect(parsed.typeId).toBe(ActivityBundleItemType.Player);
    expect(parsed.typeIndex).toBe(occupiedPlayer.typeIndex);
  });

  it("encodes type-12 auth as 174 bits with the identity key", () => {
    const key = 0x0000_0002_0000_0002n;
    const bits = encodePlayerAuth(key);
    expect(bits.bitCount).toBe(174);
    const parsed = decode(PlayerAuth, bits.bytes);
    expect(parsed.key).toBe(key);
  });

  it("encodes lifetime auth as 106 bits with spawn-ready state 2", () => {
    const bits = encodeLifetimeAuth();
    expect(bits.bitCount).toBe(106);
    const parsed = decode(LifetimeAuth, bits.bytes);
    expect(parsed.state).toBe(2);
    expect(parsed.flag1).toBe(true);
    expect(parsed.phaseIndex).toBe(3);
    expect(parsed.phaseHash >>> 0).toBe(0x45bc13ac);
    expect(parsed.field4).toBe(21);
  });

  it("encodes type-1 roster count 1 as 50 body bits", () => {
    const bits = encodeSquadAuth(1);
    expect(bits.bitCount).toBe(50);
  });

  it("preserves non-zero native entity indices in squad rosters", () => {
    expect(decode(SquadAuth, encodeSquadAuth(2, [1, 2]).bytes).roster?.slots).toEqual([
      1, 2,
    ]);
    expect(
      decode(SquadSense, encodeSquadSense(2, false, [1, 2]).bytes).roster
        ?.slots
    ).toEqual([1, 2]);
  });

  it("plaza #2 postmaster is definition count 2", () => {
    const entries = buildTowerApplySenseEntries(
      playerKeyFromCharacter(),
      towerFah.initialBubble
    );
    const postmaster = entries.find(
      (entry) =>
        entry.clientRef.typeId === ActivityBundleItemType.Squad &&
        entry.clientRef.typeIndex === 2
    );
    expect(postmaster?.authBits).toBe(encodeSquadAuth(2).bitCount);
  });

  it("encodes type-1 roster count 0 as 18 body bits", () => {
    const bits = encodeSquadAuth(0);
    expect(bits.bitCount).toBe(18);
  });

  it("encodes type-1 Phase A sense count 1 as 48 body bits", () => {
    const bits = encodeSquadSense(1, false);
    expect(bits.bitCount).toBe(48);
  });

  it("stages Action Mock's complete regular squad family and root objective", () => {
    const entries = buildTowerApplySenseEntries(
      playerKeyFromCharacter(0x200000002n),
      0,
      "action_mock"
    );
    const actionEntries = entries.filter(
      (entry) => entry.clientRef.bundle === actionMock.bundle
    );
    const squads = actionEntries.filter(
      // The separately tested r549 registry binding also initializes squad1.
      (entry) => entry.clientRef.typeId === ActivityBundleItemType.Squad && entry.clientRef.typeIndex !== 1
    );
    expect(squads.map((entry) => entry.clientRef.typeIndex)).toEqual([2, 3, 4, 5]);
    for (const squad of squads) {
      expect(decode(SquadAuth, squad.authBody!).roster?.slots).toEqual([0]);
      expect(decode(SquadAuth, squad.authBody!).ref0).toBeUndefined();
      expect(decode(SquadAuth, squad.authBody!).ref1).toEqual({
        bundle: actionMock.bundle | 0,
        typeId: ActivityBundleItemType.Objective,
        typeIndex: 0,
      });
      expect(decode(SquadSense, squad.senseBody!).valid).toBe(false);
    }
    expect(
      actionEntries.some(
        (entry) =>
          entry.clientRef.typeId === ActivityBundleItemType.Objective &&
          entry.clientRef.typeIndex === 0 &&
          (entry.authBits ?? 0) > 0 &&
          entry.senseBits === 0
      )
    ).toBe(true);
    expect(
      actionEntries
        .filter(
          (entry) => entry.clientRef.typeId === ActivityBundleItemType.Sequence
        )
        .map((entry) => entry.clientRef.typeIndex).sort((a,b)=>a-b)
    ).toEqual(actionRegistry.rows.filter(row=>row.bundle==='F7BD8718'&&row.typeId===ActivityBundleItemType.Sequence).map(row=>row.typeIndex).sort((a,b)=>a-b));
    expect(
      actionEntries
        .filter(
          (entry) =>
            entry.clientRef.typeId === ActivityBundleItemType.PlayerObjective
        )
        .map((entry) => entry.clientRef.typeIndex).sort((a,b)=>a-b)
    ).toEqual(actionRegistry.rows.filter(row=>row.bundle==='F7BD8718'&&row.typeId===ActivityBundleItemType.PlayerObjective).map(row=>row.typeIndex).sort((a,b)=>a-b));
    // Full r549 registry coverage, including these additional idle sequences,
    // is compared against its captured fixture in action-initial-binding.test.
    const sharedTypes=[ActivityBundleItemType.Lifetime,ActivityBundleItemType.Player];
    expect(entries.filter(entry=>sharedTypes.includes(entry.clientRef.typeId))
      .map(entry=>`${(entry.clientRef.bundle>>>0).toString(16).toUpperCase()}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`).sort())
      .toEqual(actionRegistry.rows.filter(row=>sharedTypes.includes(row.typeId))
        .map(row=>`${row.bundle}/${row.typeId}/${row.typeIndex}`).sort());
  });

  it("builds absolute native Action Mock objective and squad activation", () => {
    const objective = buildActionMockObjectiveActivationSenseEntries(0);
    expect(objective).toHaveLength(1);
    expect(objective[0]?.clientRef).toEqual({
      bundle: actionMock.bundle,
      typeId: ActivityBundleItemType.Objective,
      typeIndex: 0,
    });
    expect(objective[0]?.nativeBodyFraming).toBe(true);
    expect(objective[0]?.isReceivedSenseState).toBe(true);
    expect(objective[0]?.isSenseUpdateRelative).toBe(false);
    expect(objective[0]?.senseStateSequence).toBe(0);
    expect(decode(ObjectiveSense, objective[0]!.authBody!).table?.values[1]).toBe(
      1
    );

    const squads = buildActionMockSquadActivationSenseEntries(0);
    expect(squads.map((entry) => entry.clientRef)).toEqual(
      [2, 3, 4, 5].map((typeIndex) => ({
        bundle: actionMock.bundle,
        typeId: ActivityBundleItemType.Squad,
        typeIndex,
      }))
    );
    for (const squad of squads) {
      expect(squad.nativeBodyFraming).toBe(true);
      expect(squad.isReceivedSenseState).toBe(true);
      expect(squad.isSenseUpdateRelative).toBe(false);
      expect(squad.senseStateSequence).toBe(0);
      expect(decode(SquadAuth, squad.authBody!).roster?.slots).toEqual([1]);
      expect(decode(SquadAuth, squad.authBody!).ref0).toBeUndefined();
      expect(decode(SquadAuth, squad.authBody!).ref1).toEqual({
        bundle: actionMock.bundle | 0,
        typeId: ActivityBundleItemType.Objective,
        typeIndex: 0,
      });
      expect(decode(SquadSense, squad.senseBody!)).toMatchObject({
        valid: true,
        roster: { slots: [1] },
      });
    }
  });

  it("does not undo activated Action Mock combat on a same-slice refresh", () => {
    const entries = buildTowerApplySenseEntries(
      playerKeyFromCharacter(0x200000002n),
      0,
      "action_mock",
      true,
      false
    );
    const resetRows = entries.filter(
      (entry) =>
        entry.clientRef.bundle === actionMock.bundle &&
        ((entry.clientRef.typeId === ActivityBundleItemType.Objective &&
          entry.clientRef.typeIndex === 0) ||
          (entry.clientRef.typeId === ActivityBundleItemType.Squad &&
            [2, 3, 4, 5].includes(entry.clientRef.typeIndex)) ||
          (entry.clientRef.typeId === ActivityBundleItemType.PlayerObjective &&
            entry.clientRef.typeIndex === 12) ||
          (entry.clientRef.typeId === ActivityBundleItemType.Sequence &&
            [13, 14].includes(entry.clientRef.typeIndex)))
    );
    expect(resetRows).toEqual([]);
  });

  it("builds absolute Phase B activation for Chapter 2's first Vex objective and squads", () => {
    const entries = buildVenusVexActivationSenseEntries(3);
    expect(entries.map((entry) => entry.clientRef)).toEqual(
      [
        { typeId: ActivityBundleItemType.Objective, typeIndex: 1 },
        { typeId: ActivityBundleItemType.Squad, typeIndex: 2 },
        { typeId: ActivityBundleItemType.Squad, typeIndex: 3 },
      ].map(({ typeId, typeIndex }) => ({
        bundle: activityBundleForSlice("venus_chapter_2", 16)!.bundle,
        typeId,
        typeIndex,
      }))
    );
    const objective = entries[0];
    expect(objective.authBits).toBe(encodeObjectiveActivationAuth().bitCount);
    expect(objective.authBits).toBe(33);
    expect(objective.authBody?.subarray(0, 5).toString("hex")).toBe(
      "a040000000"
    );
    expect(decode(ObjectiveSense, objective.authBody!).table?.values[1]).toBe(
      1
    );
    expect(objective.senseBits).toBe(encodeObjectiveReceivedState().bitCount);
    expect(objective.senseBits).toBe(3);
    expect(objective.senseBody).toBeDefined();
    expect(decode(ObjectiveAuth, objective.senseBody!)).toEqual({
      table: undefined,
      unk1: undefined,
      unk2: undefined,
    });
    expect(objective.isReceivedSenseState).toBe(true);
    expect(objective.isSenseUpdateRelative).toBe(false);
    expect(objective.senseStateSequence).toBe(3);

    const squads = entries.slice(1);
    for (const entry of squads) {
      expect(entry.authBits).toBe(
        encodeSquadAuth(1, [], {
          group: {
            bundle: 0x8cc3_1436,
            typeId: ActivityBundleItemType.SquadGroup,
            typeIndex: 80,
          },
          firingAreaSet: {
            bundle: 0x8cc3_1436,
            typeId: ActivityBundleItemType.FiringAreaSet,
            typeIndex: 79,
          },
        }).bitCount
      );
      expect(entry.senseBits).toBe(encodeSquadSense(1, true).bitCount);
      expect(entry.isReceivedSenseState).toBe(true);
      expect(entry.isSenseUpdateRelative).toBe(false);
      expect(entry.nativeBodyFraming).toBe(true);
      expect(entry.senseStateSequence).toBe(3);
      expect(decode(SquadSense, entry.senseBody!).valid).toBe(true);
    }
    expect(
      squads.map((entry) => decode(SquadAuth, entry.authBody!).roster?.slots)
    ).toEqual([[1], [2]]);
    const firingAreaRefs = squads.map(
      (entry) => decode(SquadAuth, entry.authBody!).ref1
    );
    for (const ref of firingAreaRefs) {
      expect(ref!.bundle >>> 0).toBe(0x8cc3_1436);
      expect(ref?.typeId).toBe(ActivityBundleItemType.FiringAreaSet);
      expect(ref?.typeIndex).toBe(79);
    }
    const squadGroupRefs = squads.map(
      (entry) => decode(SquadAuth, entry.authBody!).ref0
    );
    for (const ref of squadGroupRefs) {
      expect(ref!.bundle >>> 0).toBe(0x8cc3_1436);
      expect(ref?.typeId).toBe(ActivityBundleItemType.SquadGroup);
      expect(ref?.typeIndex).toBe(80);
    }
    expect(
      squads.map((entry) => decode(SquadSense, entry.senseBody!).roster?.slots)
    ).toEqual([[1], [2]]);

    const squadPayload = senseEntryPayloadBits(squads[0]!);
    const authBits = squads[0]!.authBits!;
    const senseBits = squads[0]!.senseBits!;
    expect(squadPayload).toHaveLength(2 + authBits + 4 + senseBits + 32);
    expect(squadPayload.slice(0, 2)).toEqual([0, 1]);
    expect(squadPayload.slice(2, 2 + authBits)).toEqual(
      Array.from({ length: authBits }, (_, bit) =>
        (squads[0]!.authBody![bit >> 3] >> (7 - (bit & 7))) & 1
      )
    );
    expect(squadPayload.slice(2 + authBits, 6 + authBits)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("splits Venus squad placement from the acknowledgement-gated objective", () => {
    const squads = buildVenusVexSquadActivationSenseEntries(3);
    expect(squads.map((entry) => entry.clientRef.typeIndex)).toEqual([2, 3]);
    expect(
      squads.every(
        (entry) => entry.clientRef.typeId === ActivityBundleItemType.Squad
      )
    ).toBe(true);
    expect(squads.every((entry) => entry.senseStateSequence === 3)).toBe(true);

    const objective = buildVenusVexObjectiveActivationSenseEntries(0);
    expect(objective).toHaveLength(1);
    expect(objective[0]?.clientRef).toEqual({
      bundle: activityBundleForSlice("venus_chapter_2", 16)!.bundle,
      typeId: ActivityBundleItemType.Objective,
      typeIndex: 1,
    });
    expect(objective[0]?.senseStateSequence).toBe(0);
    expect(objective[0]?.nativeBodyFraming).toBe(true);
    expect(senseEntryPayloadBits(objective[0]!).slice(0, 2)).toEqual([0, 1]);

    const monitor = buildVenusVexPlayerMonitorReceivedSenseEntries(0);
    expect(monitor).toHaveLength(1);
    expect(monitor[0]?.clientRef).toEqual({
      bundle: activityBundleForSlice("venus_chapter_2", 16)!.bundle,
      typeId: ActivityBundleItemType.PlayerMonitor,
      typeIndex: 33,
    });
    expect(monitor[0]?.senseStateSequence).toBe(0);
    expect(monitor[0]?.nativeBodyFraming).toBe(true);
    expect(monitor[0]?.isReceivedSenseState).toBe(true);
    expect(monitor[0]?.isSenseUpdateRelative).toBe(false);
    expect(decode(PlayerMonitorSense, monitor[0]!.senseBody!)).toEqual({
      flag0: false,
      flag1: false,
      unk2: 0,
      unk3: 0,
    });
  });

  it("encodes leftover dirty-0 Some at XWS widths", () => {
    expect(encodeScoreboardAuth().bitCount).toBe(19);
    expect(encodeHardWipeGlobalsAuth().bitCount).toBe(193);
    decode(HardWipeGlobalsAuth, encodeHardWipeGlobalsAuth().bytes);
    expect(encodeTimerAuth().bitCount).toBe(226);
    expect(encodeObjectiveAuth().bitCount).toBe(2);
    expect(encodePlayerMonitorAuth().bitCount).toBe(86);
    expect(encodePlayerMonitorSense().bitCount).toBe(66);
    expect(encodeFireteamAuth().bitCount).toBe(101);
    expect(encodeObjectAuth().bitCount).toBe(91);
    expect(encodeSafeZoneAuth().bitCount).toBe(86);
    expect(encodeObjectFilterAuth().bitCount).toBe(4);
    expect(encodePlayerObjectiveAuth().bitCount).toBe(2617);
    decode(SequenceAuth, encodeSequenceAuth().bytes);
    decode(CinematicAuth, encodeCinematicAuth().bytes);
    decode(HealthAuth, encodeHealthAuth().bytes);
    decode(PlayerTriggerAuth, encodePlayerTriggerAuth().bytes);
    decode(LootAuth, encodeLootAuth().bytes);
  });

  it("join grant is Lifetime + Player on 4786 only", () => {
    const key = playerKeyFromCharacter(0x200000002n);
    const entries = buildTowerBinderSenseEntries(key);
    expect(entries[0]?.clientRef).toEqual({
      bundle: towerStory.bundle,
      typeId: ActivityBundleItemType.Lifetime,
      typeIndex: storyLifetime.typeIndex,
    });
    expect(senseEntryPayloadBits(entries[0]!).length).toBe(2 + 106);
    expect(entries).toHaveLength(1 + storyPlayers.length);
    expect(entries.every((e) => e.clientRef.bundle === towerStory.bundle)).toBe(
      true
    );
    expect(
      entries.some((e) => e.clientRef.typeId === ActivityBundleItemType.Squad)
    ).toBe(false);
    expect(
      entries.some((e) => e.clientRef.typeId === ActivityBundleItemType.Actor)
    ).toBe(false);
  });

  it("looks up Tower slices in scenario order", () => {
    const name = towerFah.activityName;
    expect(activityBundleForSlice(name, 0)?.bundle).toBe(0x8d3f1166);
    expect(activityBundleForSlice(name, 1)).toBeUndefined();
    expect(activityBundleForSlice(name, 2)?.bundle).toBe(0x19d43443);
    expect(activityBundleForSlice(name, 3)?.bundle).toBe(towerPlaza.bundle);
    expect(activityBundleForSlice(name, 4)?.bundle).toBe(0xaa891b91);
  });

  it("looks up Venus physical bubbles from the packaged host scenario", () => {
    expect(activityBundleForSlice("venus_chapter_2", 0)?.bundle).toBe(
      0x9297a442
    );
    expect(activityBundleForSlice("venus_chapter_2", 2)).toBeUndefined();
    expect(activityBundleForSlice("venus_chapter_2", 8)?.bundle).toBe(0x44fb7aa2);
    expect(activityBundleForSlice("venus_chapter_2", 14)?.bundle).toBe(0xee5b8c2a);
    expect(activityBundleForSlice("venus_chapter_2", 23)?.bundle).toBe(0x0a6d9003);
    expect(activityBundleForSlice("venus_chapter_2", 16)?.bundle).toBe(
      0x8cc31436
    );
    expect(activityBundleForSlice("venus_portal_1", 16)?.bundle).toBe(
      0x8cc31436
    );
    expect(activityBundleForSlice("venus_bounty_1", 21)?.bundle).toBe(
      0x22859cf8
    );
  });

  it("apply is identity + current-slice squads + leftover Some", () => {
    const key = playerKeyFromCharacter(0x200000002n);
    const leftovers = buildTowerLeftoverSenseEntries(towerPlaza);
    const entries = buildTowerApplySenseEntries(key, towerFah.initialBubble);
    expect(entries[0]?.clientRef).toEqual({
      bundle: towerStory.bundle,
      typeId: ActivityBundleItemType.Lifetime,
      typeIndex: storyLifetime.typeIndex,
    });
    expect(entries).toHaveLength(
      1 + storyPlayers.length + plazaSquads.length + leftovers.length
    );
    const type1Bundles = new Set(
      entries
        .filter((e) => e.clientRef.typeId === ActivityBundleItemType.Squad)
        .map((e) => e.clientRef.bundle)
    );
    expect([...type1Bundles]).toEqual([towerPlaza.bundle]);
    expect(
      entries.some(
        (e) => e.clientRef.typeId === ActivityBundleItemType.Scoreboard
      )
    ).toBe(true);
    const type2 = entries.filter(
      (e) => e.clientRef.typeId === ActivityBundleItemType.Actor
    );
    expect(type2).toHaveLength(plazaActors.length);
    expect(type2.every((e) => (e.authBits ?? 0) === 0)).toBe(true);
  });

  it("uses Venus mission-global PlayerObjective refs for Chapter 2", () => {
    const key = playerKeyFromCharacter(0x200000002n);
    const entries = buildTowerApplySenseEntries(key, 2, "venus_chapter_2");
    const missionObjectives = entries.filter(
      (entry) =>
        entry.clientRef.bundle === venusHub.bundle &&
        entry.clientRef.typeId === ActivityBundleItemType.PlayerObjective
    );
    const expected = venusHub.rows.filter(
      (row) => row.typeId === ActivityBundleItemType.PlayerObjective
    );
    expect(missionObjectives).toHaveLength(expected.length);
    expect(expected).toHaveLength(10);
    expect(entries.some((entry) => entry.clientRef.bundle === 0xf2d88bd0)).toBe(
      false
    );
  });

  it("supplies Venus initial-slice mission sensor auth", () => {
    const slice = activityBundleForSlice("venus_chapter_2", 16)!;
    const entries = buildTowerApplySenseEntries(
      playerKeyFromCharacter(0x200000002n),
      16,
      "venus_chapter_2"
    );
    for (const typeId of [
      ActivityBundleItemType.Objective,
      ActivityBundleItemType.PlayerMonitor,
    ]) {
      const actual = entries.filter(
        (entry) =>
          entry.clientRef.bundle === slice.bundle &&
          entry.clientRef.typeId === typeId
      );
      const expected = slice.rows.filter((row) => row.typeId === typeId);
      expect(actual).toHaveLength(expected.length);
      expect(expected.length).toBeGreaterThan(0);
      expect(actual.every((entry) => (entry.authBits ?? 0) > 0)).toBe(true);
    }
  });

  it("covers the complete live Venus Chapter 2 registry", () => {
    const entries = buildTowerApplySenseEntries(
      playerKeyFromCharacter(0x200000002n),
      16,
      "venus_chapter_2"
    );
    const counts = new Map<number, number>();
    for (const entry of entries) {
      counts.set(
        entry.clientRef.bundle,
        (counts.get(entry.clientRef.bundle) ?? 0) + 1
      );
    }
    expect(entries).toHaveLength(147);
    expect(counts.get(towerStory.bundle)).toBe(21);
    expect(counts.get(venusHub.bundle)).toBe(66);
    expect(
      counts.get(activityBundleForSlice("venus_chapter_2", 16)!.bundle)
    ).toBe(44);
    expect(counts.get(venusPlayers.bundle)).toBe(16);
    const venusSquads = entries.filter(
      (entry) =>
        entry.clientRef.bundle ===
          activityBundleForSlice("venus_chapter_2", 16)!.bundle &&
        entry.clientRef.typeId === ActivityBundleItemType.Squad
    );
    expect(venusSquads).toHaveLength(11);
    const firstVexEncounter = venusSquads.filter((entry) =>
      [2, 3].includes(entry.clientRef.typeIndex)
    );
    expect(firstVexEncounter).toHaveLength(2);
    for (const entry of firstVexEncounter) {
      expect(entry.senseBits).toBe(encodeSquadSense(1, false).bitCount);
      expect(entry.isReceivedSenseState).toBe(true);
      expect(entry.isSenseUpdateRelative).toBe(true);
      expect(entry.senseStateSequence ?? 0).toBe(0);
      expect(decode(SquadSense, entry.senseBody!).valid).toBe(false);
    }
    expect(
      firstVexEncounter.map(
        (entry) => decode(SquadAuth, entry.authBody!).roster?.slots
      )
    ).toEqual([[0], [0]]);
    expect(
      venusSquads
        .filter((entry) => ![2, 3].includes(entry.clientRef.typeIndex))
        .every((entry) => (entry.senseBits ?? 0) === 0)
    ).toBe(true);
    const twoMemberSquadIndices = new Set([11, 17]);
    expect(
      venusSquads
        .filter((entry) => twoMemberSquadIndices.has(entry.clientRef.typeIndex))
        .every((entry) => entry.authBits === encodeSquadAuth(2).bitCount)
    ).toBe(true);
    expect(
      venusSquads
        .filter(
          (entry) =>
            !twoMemberSquadIndices.has(entry.clientRef.typeIndex) &&
            ![2, 3].includes(entry.clientRef.typeIndex)
        )
        .every(
          (entry) => entry.authBits === encodeSquadAuth(1).bitCount
        )
    ).toBe(true);
    expect(
      new Set(
        entries.map(
          (entry) =>
            `${entry.clientRef.bundle}:${entry.clientRef.typeId}:${entry.clientRef.typeIndex}`
        )
      ).size
    ).toBe(entries.length);
  });

  it("underwatch #8 talkers use definition count 3", () => {
    const entries = buildTowerApplySenseEntries(playerKeyFromCharacter(), 4);
    const talkers = entries.find(
      (e) =>
        e.clientRef.bundle === towerUnderwatch.bundle &&
        e.clientRef.typeId === ActivityBundleItemType.Squad &&
        e.clientRef.typeIndex === 8
    );
    expect(talkers?.authBits).toBe(encodeSquadAuth(3).bitCount);
  });

  it("stages the Tower Postmaster roster before one-shot placement", () => {
    const apply = buildTowerApplySenseEntries(playerKeyFromCharacter(), 3);
    const phaseA = apply.find(
      (entry) =>
        entry.clientRef.bundle === towerPlaza.bundle &&
        entry.clientRef.typeId === ActivityBundleItemType.Squad &&
        entry.clientRef.typeIndex === 2
    );
    expect(phaseA?.senseBits).toBe(encodeSquadSense(2, false).bitCount);
    expect(decode(SquadAuth, phaseA!.authBody!).roster?.slots).toEqual([1, 1]);
    expect(decode(SquadSense, phaseA!.senseBody!).roster?.slots).toEqual([1, 1]);

    const [phaseB] = buildTowerPostmasterActivationSenseEntries(7);
    expect(phaseB?.clientRef).toEqual({
      bundle: towerPlaza.bundle,
      typeId: ActivityBundleItemType.Squad,
      typeIndex: 2,
    });
    expect(phaseB?.authBits).toBe(encodeSquadAuth(2).bitCount);
    expect(phaseB?.senseBits).toBe(encodeSquadSense(2, true).bitCount);
    expect(decode(SquadAuth, phaseB!.authBody!).roster?.slots).toEqual([1, 1]);
    expect(decode(SquadSense, phaseB!.senseBody!).roster?.slots).toEqual([1, 1]);
    expect(phaseB?.isSenseUpdateRelative).toBe(false);
    expect(phaseB?.senseStateSequence).toBe(7);
  });

  it("stages and activates every authored plaza vendor squad", () => {
    const apply = buildTowerApplySenseEntries(playerKeyFromCharacter(), 3);
    const staged = apply.filter(
      (entry) =>
        entry.clientRef.bundle === towerPlaza.bundle &&
        entry.clientRef.typeId === ActivityBundleItemType.Squad &&
        entry.clientRef.typeIndex >= 2 &&
        entry.clientRef.typeIndex <= 8
    );
    expect(staged.map((entry) => entry.clientRef.typeIndex)).toEqual([
      2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(decode(SquadSense, staged[0]!.senseBody!).valid).toBe(false);
    expect(
      staged.map(
        (entry) => decode(SquadAuth, entry.authBody!).roster?.slots
      )
    ).toEqual([[1, 1], [1], [1], [1], [1], [1], [1]]);
    for (const entry of staged) {
      expect(decode(SquadSense, entry.senseBody!).valid).toBe(false);
    }

    const activated = buildTowerVendorActivationSenseEntries(3);
    expect(activated.map((entry) => entry.clientRef.typeIndex)).toEqual([
      2, 3, 4, 5, 6, 7, 8,
    ]);
    for (const entry of activated) {
      expect(decode(SquadSense, entry.senseBody!).valid).toBe(true);
      expect(entry.isSenseUpdateRelative).toBe(false);
      expect(entry.senseStateSequence).toBe(0);
    }
  });

  it("stages every Tower vendor slice before one absolute activation", () => {
    const cases = [
      { slice: 0, indices: [12, 13, 14, 15, 16, 17] },
      { slice: 2, indices: [45, 46, 47, 48, 49, 50, 51] },
      { slice: 3, indices: [2, 3, 4, 5, 6, 7, 8] },
      { slice: 4, indices: [0, 2, 4] },
    ];
    const allSlots: number[] = [];
    for (const { slice, indices } of cases) {
      const activated = buildTowerVendorActivationSenseEntries(slice);
      expect(activated.map((entry) => entry.clientRef.typeIndex)).toEqual(
        indices
      );
      expect(new Set(activated.map((entry) => entry.clientRef.typeIndex)).size)
        .toBe(activated.length);

      const apply = buildTowerApplySenseEntries(playerKeyFromCharacter(), slice);
      for (const active of activated) {
        allSlots.push(
          ...(decode(SquadAuth, active.authBody!).roster?.slots ?? [])
        );
        const staged = apply.find(
          (entry) =>
            entry.clientRef.bundle === active.clientRef.bundle &&
            entry.clientRef.typeId === active.clientRef.typeId &&
            entry.clientRef.typeIndex === active.clientRef.typeIndex
        );
        expect(staged).toBeDefined();
        expect(decode(SquadSense, staged!.senseBody!).valid).toBe(false);
        expect(decode(SquadAuth, staged!.authBody!).roster?.slots).toEqual(
          decode(SquadAuth, active.authBody!).roster?.slots
        );
        expect(decode(SquadSense, active.senseBody!).valid).toBe(true);
        expect(active.isSenseUpdateRelative).toBe(false);
        expect(active.senseStateSequence).toBe(0);
      }
    }
    expect(allSlots).toHaveLength(24);
    // Native sums these values as spawn counts. Unique IDs would multiply NPCs.
    expect(allSlots).toEqual(Array(24).fill(1));
    expect(allSlots.reduce((total, count) => total + count, 0)).toBe(24);
    expect(buildTowerVendorActivationSenseEntries(1)).toEqual([]);
  });

  it("preserves activated vendors across same-slice refreshes", () => {
    const refreshed = buildTowerApplySenseEntries(
      playerKeyFromCharacter(),
      3,
      towerFah.activityName,
      false
    ).filter(
      (entry) =>
        entry.clientRef.bundle === towerPlaza.bundle &&
        entry.clientRef.typeId === ActivityBundleItemType.Squad &&
        entry.clientRef.typeIndex >= 2 &&
        entry.clientRef.typeIndex <= 8
    );
    expect(refreshed).toHaveLength(7);
    for (const entry of refreshed) {
      expect(entry.authBody).toBeDefined();
      expect(entry.senseBody).toBeUndefined();
    }
  });

  it("unmapped slice sends identity leftovers without type-1", () => {
    const key = playerKeyFromCharacter(0x200000002n);
    const entries = buildTowerApplySenseEntries(key, 1);
    expect(
      entries.some((e) => e.clientRef.typeId === ActivityBundleItemType.Squad)
    ).toBe(false);
    expect(
      entries.some((e) => e.clientRef.typeId === ActivityBundleItemType.Actor)
    ).toBe(false);
  });

  it("leftover-only packet has no type-1 and no identity", () => {
    const leftovers = buildTowerLeftoverSenseEntries(towerPlaza);
    expect(
      leftovers.some((e) => e.clientRef.typeId === ActivityBundleItemType.Squad)
    ).toBe(false);
    expect(
      leftovers.some(
        (e) => e.clientRef.typeId === ActivityBundleItemType.Lifetime
      )
    ).toBe(false);
    expect(
      leftovers.some(
        (e) => e.clientRef.typeId === ActivityBundleItemType.Player
      )
    ).toBe(false);
    const type2 = leftovers.filter(
      (e) => e.clientRef.typeId === ActivityBundleItemType.Actor
    );
    expect(type2).toHaveLength(plazaActors.length);
    expect(type2.every((e) => (e.authBits ?? 0) === 0)).toBe(true);
    const payload = buildTowerSensorAuthRsat({
      grantTable: false,
      scenario: {
        activityName: "city_tower_default1",
        bubbleCount: 5,
        familyChecksum: 0,
        initialBubble: towerFah.initialBubble,
        privateChecksum: 0,
        publicChecksum: 0,
        tag: 0,
      },
    });
    const br = new BitReader(payload);
    expect(br.readBit()).toBe(0);
  });

  it("grants every non-empty Tower bubble plus domain", () => {
    const machine = Buffer.from("7c1e52a389ce", "hex");
    const payload = buildTowerSensorAuthRsat({
      activityTime: 30,
      authorityMachine: machine,
      playerKey: 0x200000002n,
      grantTable: true,
      scenario: {
        activityName: "city_tower_default1",
        bubbleCount: 5,
        familyChecksum: 0,
        initialBubble: towerFah.initialBubble,
        privateChecksum: 0,
        publicChecksum: 0,
        tag: 0,
      },
    });
    const br = new BitReader(payload);
    expect(br.readBit()).toBe(1);
    const slots: number[] = [];
    for (let i = 0; i < 65; i++) {
      if (br.readBit()) {
        slots.push(i);
      }
    }
    expect(slots).toEqual([0, 1, 2, 3, 4, 64]);
    expect(br.readBit()).toBe(1);
  });

  it("frames keepalive class-5 as time-only", () => {
    const payload = buildSensorAuthTickRsat(44);
    expect(payload.length).toBeLessThanOrEqual(6);
    const br = new BitReader(payload);
    expect(br.readBit()).toBe(0);
    expect(br.readNumber(32)).toBe(44);
    expect(br.readBit()).toBe(0);
  });
});
