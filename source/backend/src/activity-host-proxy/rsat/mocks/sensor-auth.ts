import venusSquadCounts from '../../venus-squad-counts.json';
import calderaInitialBindings from '../../caldera-initial-bindings.json';
import {ruinsHud,preserveRuinsApply,type RuinsRetainedAuth} from '../../venus-strike-ruins-auth';
import {strikeDialogueTriggerEntry} from '../../strike-dialogue-playback';
import {CHAPTER2_DURATIONS,chapter2SequenceEntry} from '../../chapter2-dialogue';
import { BitWriter } from "@blamnetwork/rsat";
import { ACTIVITY_BUNDLE_TAGS, activityBundleForSlice } from "../../../tags/activity_bundle";
import { tag as actionMock } from "../../../tags/activity_bundle/80A8A007_action_mock_f7bd8718";
import { tag as venusHub } from "../../../tags/activity_bundle/809B800D_venus_bounty_1_517641f1";
import { tag as patrolHub } from "../../../tags/activity_bundle/809B8017_venus_bounty_1_27dd7734";
import { tag as venusPlayers } from "../../../tags/activity_bundle/809B801B_venus_bounty_1_eaaf16e2";
import { tag as towerHub } from "../../../tags/activity_bundle/809E2007_city_tower_default1_f2d88bd0";
import { tag as towerStory } from "../../../tags/activity_bundle/809E2008_city_tower_default1_4786c0e0";
import { tag as towerClient } from "../../../tags/scenario_client/80B86004_city_tower_default1_scenario_client";
import { tag as towerFah } from "../../../tags/scenario_fah/809E2004_city_tower_default1_scenario_fah";
import {
  ActivityBundleItemType,
  type ActivityBundleRow,
  type ActivityBundleTag,
} from "../../../tags/types";
import type { ScenarioClient } from "../../scenario-client";
import southernRows from '../../southern-client-rows.json';
import northernRows from '../../northern-client-rows.json';
import northernSquads from '../../northern-squad-counts.json';
import southernSquads from '../../southern-squad-counts.json';
import towerNpcPopulations from '../../tower-npc-populations.json';
import strikeRows from '../../strike-client-rows.json';
import strikeSquads from '../../strike-squad-counts.json';
import {
  ActivityOptions,
  ActorAuth,
  CinematicAuth,
  FireteamAuth,
  HardWipeGlobalsAuth,
  HealthAuth,
  LifetimeAuth,
  LootAuth,
  ObjectAuth,
  ObjectFilterAuth,
  ObjectiveAuth,
  ObjectiveSense,
  PlayerAuth,
  PlayerMonitorAuth,
  PlayerMonitorSense,
  PlayerObjectiveAuth,
  PlayerTriggerAuth,
  SafeZoneAuth,
  ScoreboardAuth,
  SensorClientRef,
  SequenceAuth,
  SquadAuth,
  SquadSense,
  TimerAuth,
} from "../schemas/sensor";

/** Guest constructor unset client-ref (8370F1C8). */
const UNSET_CLIENT_REF = {
  bundle: 0x811c9dc5,
  typeId: -1,
  typeIndex: -1,
} as const;

/**
 * 80801603 +0x20 by bundle. Not in 80800533 — indices come from the
 * slice table, missing keys default to 1.
 */
const SQUAD_COUNTS: ReadonlyMap<number, ReadonlyMap<number, number>> = new Map([
  [
    0x8d3f1166, // boulevard
    new Map([
      [0, 3],
      [4, 3],
      [9, 2],
      [18, 3],
      [22, 3],
      [26, 3],
      [32, 3],
      [36, 2],
    ]),
  ],
  [
    0x19d43443, // military
    new Map([
      [0, 2],
      [3, 2],
      [6, 3],
      [10, 2],
      [13, 3],
      [17, 3],
      [24, 3],
      [27, 2],
      [31, 3],
      [35, 3],
      [39, 2],
      [42, 2],
    ]),
  ],
  [
    0x8cc31436, // plaza
    new Map([
      [2, 2],
      [9, 2],
      [10, 2],
      [11, 2],
      [12, 2],
      [14, 4],
      [19, 3],
      [23, 6],
      [30, 2],
      [33, 3],
      [37, 3],
      [41, 2],
      [44, 2],
      [47, 2],
      [50, 3],
    ]),
  ],
  [
    0xaa891b91, // underwatch
    new Map([
      [8, 3],
      [12, 3],
      [16, 3],
      [20, 3],
      [24, 2],
      [27, 2],
      [28, 2],
      [31, 2],
    ]),
  ],
]);

/**
 * Venus Chapter 2 shares its 8CC31436 bundle hash with Tower plaza, but the
 * embedded definitions do not share Tower's roster sizes. Keep independently
 * proven Venus exceptions here. The first two native definitions (indices 2
 * and 3) both use the format's natural one-member default, so Venus rows use
 * one unless a later native assertion proves an exception.
 */
const VENUS_SQUAD_COUNTS: ReadonlyMap<number, number> = new Map([
  [2, 1],
  [3, 1],
  [11, 2],
  [17, 2],
]);

const VENUS_CHAPTER_2_INITIAL_SLICE = 16;
const ACTION_MOCK_INITIAL_SLICE = 0;
const ACTION_MOCK_REGULAR_SQUADS = new Set([2, 3, 4, 5]);
const ACTION_MOCK_REGULAR_SQUAD_ROSTER = [1] as const;
/**
 * 80A8A00F's decoded Squad 2 record stores ref0 unset and this exact
 * Objective 0 client-ref in ref1. EncounterBinding 116 shares the record's
 * D8F96A96 relationship key, so preserve the authored link in both phases.
 */
const ACTION_MOCK_ROOT_OBJECTIVE_REF: SensorClientRefFields = {
  bundle: 0xf7bd_8718,
  typeId: ActivityBundleItemType.Objective,
  typeIndex: 0,
};
const ACTION_MOCK_KILL_PLAYER_OBJECTIVE = 12;
const ACTION_MOCK_KILL_SEQUENCES = new Set([13, 14]);
const VENUS_CHAPTER_2_FIRST_VEX_ROSTERS: ReadonlyMap<
  number,
  readonly number[]
> = new Map([
  [2, [1]],
  [3, [2]],
]);
const VENUS_CHAPTER_2_FIRST_VEX_SQUAD_GROUP: SensorClientRefFields = {
  bundle: 0x8cc3_1436,
  typeId: ActivityBundleItemType.SquadGroup,
  typeIndex: 80,
};
const VENUS_CHAPTER_2_FIRST_VEX_FIRING_AREA_SET: SensorClientRefFields = {
  bundle: 0x8cc3_1436,
  typeId: ActivityBundleItemType.FiringAreaSet,
  typeIndex: 79,
};
const VENUS_CHAPTER_2_FIRST_VEX_REFS = {
  group: VENUS_CHAPTER_2_FIRST_VEX_SQUAD_GROUP,
  firingAreaSet: VENUS_CHAPTER_2_FIRST_VEX_FIRING_AREA_SET,
} as const;
const TOWER_PLAZA_SLICE = 3;
const TOWER_PLAZA_BUNDLE = 0x8cc3_1436;
const TOWER_POSTMASTER_SQUAD = 2;
// These roster integers are per-authored-member population targets, not IDs.
// 835AD240 computes missing members; 835AE548 sums them into spawn work.
// Sending unique values 1..24 spawned that many copies at each vendor spot.
const TOWER_VENDOR_ROSTERS: ReadonlyMap<
  number,
  ReadonlyMap<number, readonly number[]>
> = new Map([
  [
    0x8d3f_1166, // boulevard
    new Map([[12, [1]], [13, [1]], [14, [1]], [15, [1]], [16, [1]], [17, [1]]]),
  ],
  [
    0x19d4_3443, // military
    new Map([[45, [1]], [46, [1]], [47, [1]], [48, [1]], [49, [1]], [50, [1]], [51, [1]]]),
  ],
  [
    TOWER_PLAZA_BUNDLE,
    new Map([[2, [1, 1]], [3, [1]], [4, [1]], [5, [1]], [6, [1]], [7, [1]], [8, [1]]]),
  ],
  [0xaa89_1b91, new Map([[0, [1]], [2, [1]], [4, [1]]])], // underwatch
]);

const AUTHORITY_SLOTS = 65;
const DOMAIN_SLOT = 64;
const DEFAULT_PROMOTE_SEQ = 1;

export interface SensorClientRefFields {
  bundle: number;
  typeId: number;
  typeIndex: number;
}

export interface SensorAuthSenseEntry {
  authBits?: number;
  authBody?: Buffer;
  authSchemaBound: boolean;
  clientRef: SensorClientRefFields;
  /** Use the native body/reset framing proven at 8376EBA4..8376F0D4. */
  nativeBodyFraming?: boolean;
  /** Full Auth baseline; required when native sensor+18 is still pending. */
  fullAuthState?: boolean;
  /** Guest sensor+0x19. Default true when a sense body is present. */
  isReceivedSenseState?: boolean;
  /** Sense-section rel bit. Native framing encodes false as reset/absolute 1. */
  isSenseUpdateRelative?: boolean;
  senseBits?: number;
  senseBody?: Buffer;
  senseSchemaBound: boolean;
  /** Guest sensor+0x10. Keep 0 — nonzero must be monotonic or KeBugCheck. */
  senseStateSequence?: number;
}

export interface SensorAuthUpdateFields {
  activityTime?: number;
  authorityMachine?: Buffer | null;
  bubbleCount?: number;
  emptyBubbles?: readonly number[];
  /**
   * `83643B90` first bit. Retail keepalives are 0 (skip the 65-slot
   * apply). `hasAuth=1` with empty slots still calls `83643598(false)`
   * for every bubble — a demote, not a no-op.
   */
  hasAuthorityTable?: boolean;
  /**
   * When set, only this bubble + domain are promoted. Tower spawn omits
   * this so every non-empty slice is granted once (retail keepalives
   * then skip the table).
   */
  occupiedBubble?: number;
  /** Occupied type-12 identity. Default 0x00000002_00000002. */
  playerKey?: bigint;
  /**
   * Empty authority table. Join flood uses this so `830229C8` stays
   * false and `8376DEB8` never walks Type-1 into `835AE300`.
   */
  promoteNone?: boolean;
  /** 808044E1 seq. Must change vs stored or MEM-2 skips promote. */
  promoteSeq?: number;
  senseEntries?: readonly SensorAuthSenseEntry[];
}

export interface FinishedBits {
  bitCount: number;
  bytes: Buffer;
}

function rowsOf(
  tag: ActivityBundleTag,
  typeId: ActivityBundleItemType
): readonly ActivityBundleRow[] {
  return tag.rows.filter((row) => row.typeId === typeId);
}

function encodeExact(
  encodeFn: (bw: BitWriter) => void,
  capacityBytes = 4096
): FinishedBits {
  const bw = new BitWriter(capacityBytes);
  encodeFn(bw);
  const bitCount = bw.bitCount;
  return { bitCount, bytes: bw.finish() };
}

function appendBits(bw: BitWriter, body: FinishedBits): void {
  for (let i = 0; i < body.bitCount; i++) {
    bw.writeBit((body.bytes[i >> 3] >> (7 - (i & 7))) & 1);
  }
}

export function encodeSensorClientRef(
  ref: SensorClientRefFields
): FinishedBits {
  return encodeExact((bw) => {
    SensorClientRef.encode(bw, ref);
  });
}

export function encodePlayerAuth(playerKey: bigint, team = 0): FinishedBits {
  return encodeExact((bw) => {
    PlayerAuth.encode(bw, {
      key: playerKey,
      unk1: team,
      sense: {
        unk0: 0,
        nested: { count: 0 },
        flag2: false,
        unk3: 0,
        unk4: 0,
        flag5: false,
        flag6: false,
      },
      flag: false,
    });
  });
}

export function encodeLifetimeAuth(state = 2, activityName = towerFah.activityName): FinishedBits {
  // Portal FAH809B8008's first phase and client80B08009 author 1DF9F902.
  // Chapter2's 45BC13AC does not exist in the strike phase table. Preserve
  // the existing index: its wire meaning is not the zero-based table ordinal.
  const strike = activityName === 'venus_portal_1';
  const pvp = PVP_ACTIVITIES.has(activityName);
  return encodeExact((bw) => {
    LifetimeAuth.encode(bw, {
      state,
      flag1: true,
      // PvP has no authored phase rows. Preserve its native Lifetime
      // constructor's unset metadata (Factory registry capture, r576).
      phaseIndex: pvp ? -1 : 3,
      phaseHash: pvp ? 0x811c9dc5 : strike ? 0x1df9f902 : 0x45bc13ac,
      field4: pvp ? -1 : 21,
      handles: { handles: [] },
    });
  });
}

export function emptyActivityOptions() {
  return {
    flag0: false,
    windowOpen: -0x80000000,
    windowClose: 0x7fffffff,
    unk3: 0,
    unk4: 0,
    unk5: 0,
    scalar: 1,
  };
}

function zeroActivityOptions() {
  return {
    flag0: false,
    windowOpen: 0,
    windowClose: 0,
    unk3: 0,
    unk4: 0,
    unk5: 0,
    scalar: 0,
  };
}

function encodeEmptyClientRef(): FinishedBits {
  return encodeSensorClientRef(UNSET_CLIENT_REF);
}

export function encodeHardWipeGlobalsAuth(): FinishedBits {
  return encodeExact((bw) => {
    HardWipeGlobalsAuth.encode(bw, { options: emptyActivityOptions() });
  });
}

export function encodeTimerAuth(): FinishedBits {
  return encodeExact((bw) => {
    TimerAuth.encode(bw, {
      options: zeroActivityOptions(),
      flag: false,
      unk: 0,
    });
  });
}

export function encodeObjectiveAuth(): FinishedBits {
  return encodeExact((bw) => {
    // The live activity-bundle row stores 8080066B at sensor+0x0C, which is
    // the first schema decoded by 8376EDC0. Keep the historical helper name,
    // but encode the two-field empty body that this native slot expects.
    ObjectiveSense.encode(bw, {
      table: undefined,
      unk1: undefined,
    });
  });
}

/** Native simple-encounter 8080066B activation observed from the client. */
export function encodeObjectiveActivationAuth(): FinishedBits {
  return encodeExact((bw) => {
    ObjectiveSense.encode(bw, {
      table: {
        values: Array.from({ length: 24 }, (_, index) =>
          index === 1 ? 1 : undefined
        ),
      },
      unk1: undefined,
    });
  });
}

/**
 * Minimal body for the Objective row's second native schema (80800671).
 * Supplying it marks the replicated objective state as received; the earlier
 * one-section experiment stored the activation table but never entered the
 * native received-state/materialization path.
 */
export function encodeObjectiveReceivedState(): FinishedBits {
  return encodeExact((bw) => {
    ObjectiveAuth.encode(bw, {
      table: undefined,
      unk1: undefined,
      unk2: undefined,
    });
  });
}

export function encodePlayerMonitorAuth(): FinishedBits {
  return encodeExact((bw) => {
    PlayerMonitorAuth.encode(bw, {
      ref: UNSET_CLIENT_REF,
      unk: 0,
    });
  });
}

export function encodePlayerMonitorSense(): FinishedBits {
  return encodeExact((bw) => {
    PlayerMonitorSense.encode(bw, {
      flag0: false,
      flag1: false,
      unk2: 0,
      unk3: 0,
    });
  });
}

export function encodeSequenceAuth(): FinishedBits {
  return encodeExact((bw) => {
    SequenceAuth.encode(bw, {
      unk0: 0,
      unk1: 0,
      pair: {
        a: { f0: 0, f1: 0 },
        b: { f0: 0, f1: 0 },
      },
      ref: UNSET_CLIENT_REF,
    });
  });
}

export function encodeCinematicAuth(): FinishedBits {
  return encodeExact((bw) => {
    CinematicAuth.encode(bw, {
      unk0: 0,
      unk1: 0,
      ref: UNSET_CLIENT_REF,
      vec: { count: 0 },
      unk4: 0,
    });
  });
}

export function encodeHealthAuth(): FinishedBits {
  return encodeExact((bw) => {
    HealthAuth.encode(bw, {
      ref: UNSET_CLIENT_REF,
      unk1: 0,
      unk2: 0,
      unk3: 0,
    });
  });
}

export function encodePlayerTriggerAuth(): FinishedBits {
  return encodeExact((bw) => {
    PlayerTriggerAuth.encode(bw, { flag: false, unk: 0 });
  });
}

export function encodeLootAuth(enabled = false): FinishedBits {
  return encodeExact((bw) => {
    LootAuth.encode(bw, {
      flag: enabled,
      ref: UNSET_CLIENT_REF,
      unk: 0,
    });
  });
}

export function encodeFireteamAuth(playerKey = 0n): FinishedBits {
  return encodeExact((bw) => {
    FireteamAuth.encode(bw, {
      key: playerKey,
      flag: false,
      nested: { count: 0 },
      unk: 0,
    });
  });
}

export function encodeObjectAuth(): FinishedBits {
  return encodeExact((bw) => {
    ObjectAuth.encode(bw, {
      unk0: 0,
      flag: false,
      ref: UNSET_CLIENT_REF,
      vec: { count: 0 },
    });
  });
}

export function encodeSafeZoneAuth(): FinishedBits {
  return encodeExact((bw) => {
    SafeZoneAuth.encode(bw, {
      ref: UNSET_CLIENT_REF,
      unk: 0,
    });
  });
}

export function encodeObjectFilterAuth(): FinishedBits {
  return encodeExact((bw) => {
    ObjectFilterAuth.encode(bw, { vec: { count: 0 } });
  });
}

/**
 * 80802DB0 dirty-0 Some. Kind 13 is 96 bits (XWS guest bandwidth 2618-ish).
 * Type-32 goes last so a width miss only truncates the tail.
 */
export function encodePlayerObjectiveAuth(): FinishedBits {
  const ref = encodeEmptyClientRef();
  return encodeExact((bw) => {
    bw.write(1, 3);
    appendBits(bw, ref);
    bw.writeBit(0);
    ActivityOptions.encode(bw, zeroActivityOptions());
    bw.write(1, 4);
    bw.write(0, 32);
    bw.write(0, 32);
    appendBits(bw, ref);
    for (let i = 0; i < 10; i++) {
      bw.write(1, 4);
      appendBits(bw, ref);
      bw.write(0, 32);
      bw.write(0, 32);
      bw.write(0, 32);
      bw.write(0, 32);
      bw.write(0, 32);
    }
    bw.write(0, 32);
    bw.write(0, 32);
  });
}

/**
 * Chapter 2 phase00.ch2m1_collect_loot._player_objective (FNV-1 5613ABDF).
 * Packaged client 80B08819 binds 80802DB0; 82B556F8 omits state 0 from
 * the HUD. This probe supplies state 1 through the native body framing.
 * It does not claim loot collection or mission completion.
 */
export function buildVenusOpeningObjectiveEntry(): SensorAuthSenseEntry {
  return buildVenusPlayerObjectiveEntry(7, 1);
}

/** Native strike entry24: Fight into the Engineering Lab. Nav149 XYZ comes
 * from client2292+220. A HUD destination only; no movement or arrival credit.
 */
export function buildVenusStrikeEntryObjective(): SensorAuthSenseEntry {
  const bundle = 0x0a302429;
  const body = encodeExact(bw => PlayerObjectiveAuth.encode(bw, {
    unk0: 1, ref1: UNSET_CLIENT_REF, flag2: false, options: emptyActivityOptions(),
    unk4: 0, unk5: 0, unk6: 0, ref7: UNSET_CLIENT_REF,
    slots: { slots: Array.from({length: 10}, (_, index) => ({
      unk0: index === 0 ? 1 : 0,
      ref: index === 0 ? {bundle, typeId: ActivityBundleItemType.NavPoint, typeIndex: 149} : UNSET_CLIENT_REF,
      kind13: index === 0 ? Buffer.from('c382d64dc3ab0e3f41ad63cf','hex') : Buffer.alloc(12),
      unk3: 0, unk4: 0,
    })) }, unk9: 0, unk10: 0,
  }));
  return entryOn(bundle, ActivityBundleItemType.PlayerObjective, 24, body, false);
}

/** Package-authored phase01 entry: Enter Vex Territory (80B08810). */
export function buildVenusCaptainFollowupEntries(): SensorAuthSenseEntry[] {
  return [buildVenusPlayerObjectiveEntry(7, 0), buildVenusPlayerObjectiveEntry(18, 1)];
}

/** Packaged phase01.ch2m2_collect_loot objective, activated by real entry. */
export function buildVenusCollectFluidsEntries(): SensorAuthSenseEntry[] {
  return [buildVenusPlayerObjectiveEntry(18, 0), buildVenusFluidProgressEntry(0)];
}

/** r370 live Headlands pool: acknowledge the new records after native arrival. */
export function buildVenusHeadlandsArrivalEntries(): SensorAuthSenseEntry[] {
  const tag = activityBundleForSlice('venus_chapter_2', 10);
  if (tag?.bundle !== 0xb9d50318) throw new Error('Headlands bundle unavailable');
  const entries = [
    ...[135, 136, 137].map(index => entryOn(venusHub.bundle,
      ActivityBundleItemType.PlayerTrigger, index,
      encodeExact(bw => PlayerTriggerAuth.encode(bw, { flag: index === 137, unk: 0 })), false)),
    ...someRows(tag, ActivityBundleItemType.PlayerTrigger, encodePlayerTriggerAuth(), false),
    ...noneRows(tag, ActivityBundleItemType.Sequence, false),
    ...noneRows(tag, ActivityBundleItemType.PlayerObjective, false),
    buildVenusPlayerObjectiveEntry(18, 1),
  ];
  // 8376EC24: reset=1 initializes the live auth baseline; reset=0 with
  // initialPending=1 diverts decoding to scratch and marks auth invalid.
  // 8376EDA4 still reads Option<T> in both cases. This auth-only family's
  // initial payload is therefore 1,1,body (or 1,0 for default-only rows).
  return entries.map(entry => ({ ...entry, nativeBodyFraming: false }));
}

/** Native82B55570 copies auth mode/current/target at2C/30/34 to the HUD.
 * Mode1 is an isolated display test; quest completion sequence remains separate.
 */
export function buildVenusFluidProgressEntry(count: number): SensorAuthSenseEntry {
  if (!Number.isInteger(count) || count < 0 || count > 10) throw new Error('Invalid fluid count');
  return buildVenusPlayerObjectiveEntry(14, 1, count);
}

// Mission templates3512..3515, authored named gate placements at+130.
const VENUS_GATE_MARKERS = [
  { actor: 70, position: [458.6993713378906, -411.6037292480469, -6.399333477020264] },
  { actor: 72, position: [489.6964416503906, -351.7026672363281, -7.199333190917969] },
  { actor: 74, position: [624.6941528320312, -322.5045471191406, 11.804798126220703] },
  { actor: 76, position: [649.9994506835938, -223.0035858154297, 17.400665283203125] },
] as const;

export function buildVenusPlayerObjectiveEntry(typeIndex: 7 | 14 | 18 | 57 | 60 | 64 | 112 | 120 | 123 | 127, state: 0 | 1, currentCount?: number, targetCount = 10, defeatedGates: readonly number[] = []): SensorAuthSenseEntry {
  const gateMarkers = state === 1 && (typeIndex === 60 || typeIndex === 123)
    ? (typeIndex === 60 ? VENUS_GATE_MARKERS : NORTHERN_GATE_MARKERS)
      .filter(gate => !defeatedGates.includes(gate.actor)) : [];
  const body = encodeExact((bw) => {
    PlayerObjectiveAuth.encode(bw, {
      unk0: state,
      ref1: UNSET_CLIENT_REF,
      flag2: false,
      options: emptyActivityOptions(),
      unk4: currentCount === undefined ? 0 : 1,
      unk5: currentCount ?? 0,
      unk6: currentCount === undefined ? 0 : targetCount,
      ref7: UNSET_CLIENT_REF,
      slots: {
        slots: Array.from({ length: 10 }, (_, slotIndex) => {
          if(typeIndex===7 && state===1 && slotIndex===0) {
            // Native Captain template80B08D7A +140, Actor2 in entrance bundle.
            return {unk0:1,ref:{bundle:0x44fb7aa2,typeId:ActivityBundleItemType.Actor,typeIndex:2},
              kind13:Buffer.from('c3fc8018c38d70ee41c650fc','hex'),unk3:0,unk4:0};
          }
          if((typeIndex===18 || typeIndex===14) && state===1 && slotIndex===0) {
            // Guidance to authored Headlands ground encounter24, host180
            // definition+31840+58. Location322 is the objective destination.
            return {unk0:1,ref:{bundle:0x517641f1,typeId:ActivityBundleItemType.Location,typeIndex:322},
              kind13:Buffer.from('c3a1199ac431a0004195999a','hex'),unk3:0,unk4:0};
          }
          if(state===1 && slotIndex===0 && (typeIndex===64 || typeIndex===112)) {
            // Southern interactable NavPoint168 and first Northern gate Actor129.
            return typeIndex===64
              ? {unk0:1,ref:{bundle:0x517641f1,typeId:ActivityBundleItemType.NavPoint,typeIndex:168},
                 kind13:Buffer.from('43e57375c3cf3fd0c09676c2','hex'),unk3:0,unk4:0}
              : {unk0:1,ref:{bundle:0x517641f1,typeId:ActivityBundleItemType.Actor,typeIndex:129},
                 kind13:(()=>{const b=Buffer.alloc(12);NORTHERN_GATE_MARKERS[0].position.forEach((v,i)=>b.writeFloatBE(v,i*4));return b;})(),unk3:0,unk4:0};
          }
          const gate = gateMarkers[slotIndex] ?? (typeIndex === 120 && state === 1 && slotIndex === 0
            ? { actor: 81, position: [803.75, -85.75, 25.25] } : undefined);
          if (gate) {
            const position = Buffer.alloc(12);
            gate.position.forEach((value, axis) => position.writeFloatBE(value, axis * 4));
            // Native82B54BE0 copies the client identity and explicit position
            // into the HUD marker. No actor state or kill credit is supplied.
            return { unk0: 1,
              ref: { bundle: 0x517641f1, typeId: ActivityBundleItemType.Actor, typeIndex: gate.actor },
              kind13: position, unk3: 0, unk4: 0 };
          }
          return {
          // Native82B54E30 emits markers only for nonzero slot mode. The
          // first packaged NavPoint168 record in2109_808004c5 at+250 names
          // phase02.ch2m3_interactable._nav_point; +260 holds its XYZ.
          unk0: typeIndex === 57 && state === 1 && slotIndex === 0 ? 1 : 0,
          ref: typeIndex === 57 && state === 1 && slotIndex === 0
            ? { bundle: 0x517641f1, typeId: ActivityBundleItemType.NavPoint, typeIndex: 168 }
            : UNSET_CLIENT_REF,
          kind13: typeIndex === 57 && state === 1 && slotIndex === 0
            ? Buffer.from('43e57375c3cf3fd0c09676c2', 'hex') : Buffer.alloc(12),
          unk3: 0,
          unk4: 0,
          };
        }),
      },
      unk9: 0,
      unk10: 0,
    });
  });
  return {
    ...entryOn(venusHub.bundle, ActivityBundleItemType.PlayerObjective, typeIndex, body, false),
    nativeBodyFraming: true,
    fullAuthState: true,
  };
}

/**
 * 8080067A dirty encode: only field 3 (roster) is Some. Always-on fields
 * 9/10 emit defaults (1). Slot kind 5 is biased i32 (p0=0x80000000):
 * wire 0x80000000 decodes to memory 0 (83760030 empty). Wire 0 decodes
 * to 0x80000000 and AV'd the typed-handle walk. Count 1 is 50 body bits.
 */
export function encodeSquadAuth(
  memberCount: number,
  rosterSlots: readonly number[] = [],
  refs: {
    group?: SensorClientRefFields;
    firingAreaSet?: SensorClientRefFields;
  } = {}
): FinishedBits {
  return encodeExact((bw) => {
    SquadAuth.encode(bw, {
      ref0: refs.group,
      ref1: refs.firingAreaSet,
      filter: undefined,
      roster: {
        slots: Array.from(
          { length: memberCount },
          (_, index) => rosterSlots[index] ?? 0
        ),
      },
      unk4: undefined,
      unk5: undefined,
      unk6: undefined,
      unk7: undefined,
      unk8: undefined,
      unk9: 0,
      unk10: 0,
    });
  });
}

/**
 * 80800677 dirty encode. +0x17 (field 8) is the AF0A8 copy gate.
 *
 * Join flood is Phase A: valid=0 so AF0A8 inits the live roster via
 * 83760030 (+0x110). valid=1 skipped that and KeBugCheck'd 835AD3C4
 * (140103). Phase B (+0x17=1, sense rel=0) is later, after place.
 *
 * Roster count matches auth / definition. Slots are biased zeros.
 */
export function encodeSquadSense(
  memberCount: number,
  valid = false,
  rosterSlots: readonly number[] = []
): FinishedBits {
  return encodeExact((bw) => {
    SquadSense.encode(bw, {
      unk0: undefined,
      unk1: undefined,
      unk2: undefined,
      unk3: undefined,
      unk4: undefined,
      flag5: false,
      flag6: false,
      flag7: false,
      valid,
      unk9: undefined,
      roster: {
        slots: Array.from(
          { length: memberCount },
          (_, index) => rosterSlots[index] ?? 0
        ),
      },
      extras: undefined,
    });
  });
}

/** 80802DD6 empty: five length-prefixed vecs, counts 4+4+4+5+2 = 19 bits. */
export function encodeScoreboardAuth(): FinishedBits {
  return encodeExact((bw) => {
    ScoreboardAuth.encode(bw, {
      v0: { count: 0 },
      v1: { count: 0 },
      v2: { count: 0 },
      v3: { count: 0 },
      v4: { count: 0 },
    });
  });
}

export function senseEntryPayloadBits(entry: SensorAuthSenseEntry): number[] {
  const bits: number[] = [];
  const nativeBodyFraming = entry.nativeBodyFraming === true;
  const push = (bit: number) => bits.push(bit & 1);
  const pushBody = (body: Buffer, bitCount: number) => {
    for (let i = 0; i < bitCount; i++) {
      push((body[i >> 3] >> (7 - (i & 7))) & 1);
    }
  };

  if (entry.authSchemaBound) {
    if (entry.authBody && (entry.authBits ?? 0) > 0) {
      if (nativeBodyFraming) {
        // 8376EC30: 1 initializes the baseline before decoding; BOTH paths
        // reach 836907E8. A relative 0 with sensor+18 pending instead decodes
        // to scratch (8376ED70), leaves r25=0, and cannot clear pending at
        // 8376F5BC. Auth-only full snapshots can initialize fresh bindings.
        push(entry.fullAuthState === true ? 1 : 0);
        push(1);
      } else {
        push(1);
        push(1);
      }
      pushBody(entry.authBody, entry.authBits ?? 0);
    } else {
      if (nativeBodyFraming) {
        push(1);
      } else {
        push(1);
        push(0);
      }
    }
  }
  if (entry.senseSchemaBound) {
    if (entry.senseBody && (entry.senseBits ?? 0) > 0) {
      push(1);
      push(entry.isReceivedSenseState === false ? 0 : 1);
      if (nativeBodyFraming) {
        // 8376EEC8/8376EF4C: 1 resets the live sense baseline before decode.
        push(entry.isSenseUpdateRelative === false ? 1 : 0);
        // 836907E8 consumes a separate Option<T> presence bit before the
        // schema body. It is not part of SquadSense itself.
        push(1);
      } else {
        push(entry.isSenseUpdateRelative === false ? 0 : 1);
        push(1);
      }
      pushBody(entry.senseBody, entry.senseBits ?? 0);
      const seq = (entry.senseStateSequence ?? 0) >>> 0;
      for (let i = 31; i >= 0; i--) {
        push((seq >>> i) & 1);
      }
    } else {
      push(0);
    }
  }
  return bits;
}

function encodeSenseEntry(bw: BitWriter, entry: SensorAuthSenseEntry): void {
  bw.writeBit(1);
  appendBits(bw, encodeSensorClientRef(entry.clientRef));
  const payload = senseEntryPayloadBits(entry);
  bw.write(payload.length >>> 0, 32);
  for (const bit of payload) {
    bw.writeBit(bit);
  }
}

function encodeAuthorityOption(
  bw: BitWriter,
  promote: ReadonlySet<number>,
  machine: Buffer | null,
  promoteSeq = DEFAULT_PROMOTE_SEQ
): void {
  const stamp = machine && machine.length === 6 ? machine : null;
  const seq = promoteSeq & 0xffff;
  bw.writeBit(0);
  for (let i = 0; i < AUTHORITY_SLOTS; i++) {
    const promoted = promote.has(i);
    if (promoted && stamp) {
      bw.writeBit(1);
      for (const byte of stamp) {
        bw.write(byte, 8);
      }
    } else {
      bw.writeBit(0);
    }
    bw.writeBit(1);
    bw.write(promoted ? seq : 0, 16);
    bw.writeBit(0);
  }
}

function promoteSlots(
  bubbleCount: number,
  emptyBubbles: readonly number[],
  occupiedBubble?: number,
  promoteNone = false
): Set<number> {
  const slots = new Set<number>();
  if (promoteNone) {
    return slots;
  }
  const empty = new Set(emptyBubbles);
  if (
    occupiedBubble !== undefined &&
    occupiedBubble >= 0 &&
    occupiedBubble < bubbleCount &&
    !empty.has(occupiedBubble)
  ) {
    slots.add(occupiedBubble);
  } else {
    for (let i = 0; i < bubbleCount; i++) {
      if (!empty.has(i)) {
        slots.add(i);
      }
    }
  }
  slots.add(DOMAIN_SLOT);
  return slots;
}

export function playerKeyFromCharacter(character?: bigint): bigint {
  return character !== undefined && character !== 0n
    ? character
    : 0x0000_0002_0000_0002n;
}

function entryOn(
  bundle: number,
  typeId: number,
  typeIndex: number,
  body: FinishedBits | null,
  senseSchemaBound: boolean,
  sense?: FinishedBits | null
): SensorAuthSenseEntry {
  return {
    clientRef: { bundle, typeId, typeIndex },
    authSchemaBound: true,
    senseSchemaBound,
    authBody: body?.bytes,
    authBits: body?.bitCount ?? 0,
    senseBody: sense?.bytes,
    senseBits: sense?.bitCount ?? 0,
    isReceivedSenseState: sense != null,
    isSenseUpdateRelative: true,
  };
}

function someRows(
  tag: ActivityBundleTag,
  typeId: ActivityBundleItemType,
  body: FinishedBits,
  senseSchemaBound: boolean
): SensorAuthSenseEntry[] {
  return rowsOf(tag, typeId).map((row) =>
    entryOn(tag.bundle, typeId, row.typeIndex, body, senseSchemaBound)
  );
}

function noneRows(
  tag: ActivityBundleTag,
  typeId: ActivityBundleItemType,
  senseSchemaBound: boolean
): SensorAuthSenseEntry[] {
  return rowsOf(tag, typeId).map((row) =>
    entryOn(tag.bundle, typeId, row.typeIndex, null, senseSchemaBound)
  );
}

function squadEntries(
  tag: ActivityBundleTag,
  stageVendorSense = true,
  includeAmbient = false
): SensorAuthSenseEntry[] {
  const counts = SQUAD_COUNTS.get(tag.bundle);
  const vendorRosters = includeAmbient ? towerNpcRosters(tag.bundle) : TOWER_VENDOR_ROSTERS.get(tag.bundle);
  return rowsOf(tag, ActivityBundleItemType.Squad).map((row) => {
    const count = counts?.get(row.typeIndex) ?? 1;
    const slots = vendorRosters?.get(row.typeIndex) ?? [];
    const vendorPhaseA =
      stageVendorSense && slots.length > 0
        ? encodeSquadSense(count, false, slots)
        : undefined;
    return entryOn(
      tag.bundle,
      ActivityBundleItemType.Squad,
      row.typeIndex,
      encodeSquadAuth(count, slots),
      true,
      vendorPhaseA
    );
  });
}

// 00dc/180 contains the actual host population arrays. The client templates
// have one member category each; that is not the number of enemies to spawn.
const HEADLANDS_GROUND_ENCOUNTERS = [
  { squad: 24, objective: 23, group: 169, area: 140, population: [4] },
  { squad: 26, objective: 25, group: 172, area: 148, population: [4] },
  { squad: 28, objective: 27, group: 175, area: 164, population: [2] },
  { squad: 30, objective: 29, group: 178, area: 173, population: [1] },
] as const;

function venusSquadEntries(tag: ActivityBundleTag): SensorAuthSenseEntry[] {
  return rowsOf(tag, ActivityBundleItemType.Squad).map((row) => {
    const ground = tag.bundle === 0xb9d50318
      ? HEADLANDS_GROUND_ENCOUNTERS.find(e => e.squad === row.typeIndex) : undefined;
    if (ground) {
      return entryOn(tag.bundle, ActivityBundleItemType.Squad, ground.squad,
        encodeSquadAuth(1, [], { group: {
          bundle: tag.bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: ground.group,
        }, firingAreaSet: {
          bundle: tag.bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: ground.area,
        } }), true, encodeSquadSense(1, false));
    }
    if (tag.bundle === 0x44fb7aa2 && row.typeIndex === 1) {
      return entryOn(tag.bundle, ActivityBundleItemType.Squad, 1,
        encodeSquadAuth(1, [], { group: {
          bundle: tag.bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: 80,
          }, firingAreaSet: {
            bundle: tag.bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: 54,
          } }), true, encodeSquadSense(1, false));
    }
    const isPlaza = tag.bundle === 0x8cc3_1436;
    // Native client +458 template -> 80801603 +20. Every loaded area must
    // match its fixed template length (native assertion 835AE4B0).
    const native = venusSquadCounts.find(r => parseInt(r.bundle,16) === tag.bundle && r.squad === row.typeIndex);
    if (!native) throw new Error(`Missing native Venus squad template ${tag.bundle.toString(16)}/${row.typeIndex}`);
    const count = native.memberCount;
    const roster = isPlaza
      ? VENUS_CHAPTER_2_FIRST_VEX_ROSTERS.get(row.typeIndex)
      : undefined;
    // Stage the natural zero roster during Phase A. Phase B then introduces
    // the authored entity indices as a real roster delta; sending the same
    // indices in both phases only re-dirties already-linked records.
    const phaseA =
      tag.bundle === 0x8cc3_1436 && roster
        ? encodeSquadSense(count, false)
        : undefined;
    return entryOn(
      tag.bundle,
      ActivityBundleItemType.Squad,
      row.typeIndex,
      encodeSquadAuth(
        count,
        [],
        roster ? VENUS_CHAPTER_2_FIRST_VEX_REFS : undefined
      ),
      true,
      phaseA
    );
  });
}

/** Headlands' four authored initial-placement ground encounters.
 * Native templates preserve enemy variants and positions. Dropship waves are
 * separate encounters and are not substituted with extra ground enemies.
 */
export function buildVenusFluidsEncounterEntries(): SensorAuthSenseEntry[] {
  const bundle = 0xb9d50318;
  const entries = HEADLANDS_GROUND_ENCOUNTERS.flatMap(encounter => [
    entryOn(bundle, ActivityBundleItemType.Objective, encounter.objective,
      encodeObjectiveActivationAuth(), true, encodeObjectiveReceivedState()),
    entryOn(bundle, ActivityBundleItemType.Squad, encounter.squad,
      encodeSquadAuth(1, encounter.population, { group: {
        bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: encounter.group,
      }, firingAreaSet: {
        bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: encounter.area,
      } }), true, encodeSquadSense(1, true, encounter.population)),
  ]);
  for (const entry of entries) {
    entry.nativeBodyFraming = true;
    entry.isSenseUpdateRelative = false;
    entry.senseStateSequence = 0;
  }
  return [...entries, entryOn(venusHub.bundle, ActivityBundleItemType.Loot,
    17, encodeLootAuth(true), false)];
}

/** Packaged phase02 uses Location329/owner23 and PlayerObjective64. */
export function buildVenusFluidCompletionEntries(): SensorAuthSenseEntry[] {
  return [buildVenusPlayerObjectiveEntry(14, 0), buildVenusPlayerObjectiveEntry(64, 1),
    entryOn(venusHub.bundle, ActivityBundleItemType.Loot, 17, encodeLootAuth(false), false)];
}

/** Bind exactly the resource-owned slice23 sensors, including ambient/shared rows. */
export function buildVenusSouthernBindingEntries(): SensorAuthSenseEntry[] {
  const entries: SensorAuthSenseEntry[] = [];
  for (const row of southernRows) {
    const { bundle, typeId, typeIndex } = row;
    let body: FinishedBits | null;
    let sense: FinishedBits | undefined;
    let senseBound = false;
    switch (typeId) {
      case ActivityBundleItemType.Squad: {
        const squad = southernSquads.find(s => parseInt(s.bundle, 16) === bundle && s.squad === typeIndex);
        if (!squad || squad.memberCount < 1 || squad.memberCount > 8) throw new Error('Southern squad template unavailable');
        body = encodeSquadAuth(squad.memberCount);
        sense = encodeSquadSense(squad.memberCount, false);
        senseBound = true;
        break;
      }
      case ActivityBundleItemType.Actor: body = null; senseBound = true; break;
      case ActivityBundleItemType.Objective: body = encodeObjectiveAuth(); senseBound = true; break;
      case ActivityBundleItemType.Object: body = encodeObjectAuth(); senseBound = true; break;
      case ActivityBundleItemType.PlayerMonitor: body = encodePlayerMonitorAuth(); senseBound = true; break;
      case ActivityBundleItemType.PlayerTrigger: body = encodePlayerTriggerAuth(); break;
      default: continue; // Spatial definitions have no sensor authority payload.
    }
    entries.push(entryOn(bundle, typeId, typeIndex, body, senseBound, sense));
  }
  return entries;
}

/** Initial-pending refs from r574's live Caldera registry, checked against the
 * original bundle. Complete Auth initializes fresh bindings; relative updates
 * decode to scratch while pending and leave Guardian creation blocked.
 * All event triggers and timelines remain inactive.
 */
export function buildCalderaInitialBindingEntries(): SensorAuthSenseEntry[] {
  return calderaInitialBindings.map(row => {
    let body: FinishedBits | null;
    switch (row.typeId) {
      case ActivityBundleItemType.Sequence: body = encodeSequenceAuth(); break;
      case ActivityBundleItemType.PlayerObjective: body = encodePlayerObjectiveAuth(); break;
      case ActivityBundleItemType.PlayerTrigger: body = encodePlayerTriggerAuth(); break;
      case ActivityBundleItemType.Unknown24:
        // 80800634 contains kind33 without a recovered codec. Use the native
        // reset + absent-body initialization, as in Northern Unknown24/56.
        // A partial body desynchronizes the packet at the first Unknown24.
        body = null;
        break;
      default: throw new Error('Unverified Caldera initial binding type');
    }
    return {...entryOn(row.bundle, row.typeId, row.typeIndex, body,
      row.typeId === ActivityBundleItemType.Unknown24),
      nativeBodyFraming: row.typeId !== ActivityBundleItemType.Unknown24,
      fullAuthState: true};
  });
}

export function buildVenusNorthernBindingEntries(): SensorAuthSenseEntry[] {
  const entries: SensorAuthSenseEntry[] = [];
  for (const row of northernRows) {
    const { bundle, typeId, typeIndex } = row;
    let body: FinishedBits | null;
    let sense: FinishedBits | undefined;
    let senseBound = false;
    switch (typeId) {
      case ActivityBundleItemType.Squad: {
        const squad = northernSquads.find(s => parseInt(s.bundle, 16) === bundle && s.squad === typeIndex);
        if (!squad || squad.memberCount < 1 || squad.memberCount > 8) throw new Error('Northern squad template unavailable');
        body = encodeSquadAuth(squad.memberCount);
        sense = encodeSquadSense(squad.memberCount, false);
        senseBound = true;
        break;
      }
      case ActivityBundleItemType.Actor: body = null; senseBound = true; break;
      case ActivityBundleItemType.Objective: body = encodeObjectiveAuth(); senseBound = true; break;
      case ActivityBundleItemType.Object: body = encodeObjectAuth(); senseBound = true; break;
      case ActivityBundleItemType.PlayerMonitor: body = encodePlayerMonitorAuth(); senseBound = true; break;
      case ActivityBundleItemType.PlayerTrigger: body = encodePlayerTriggerAuth(); break;
      default: continue; // Spatial definitions have no sensor authority payload.
    }
    entries.push(entryOn(bundle, typeId, typeIndex, body, senseBound, sense));
  }
  return entries;
}

/** Native cookie4 arrival, then expose the authored child objective. Boss activation is separate. */
export function buildVenusNorthernArrivalEntries(): SensorAuthSenseEntry[] {
  return [buildVenusPlayerObjectiveEntry(112, 0), ...buildVenusNorthernGateEntries(),
    ...buildVenusNorthernAmbientEntries(true), buildChapter2EndGate(), buildChapter2EndMonitor(),
    {...entryOn(venusHub.bundle,ActivityBundleItemType.Objective,79,encodeObjectiveActivationAuth(),true),nativeBodyFraming:true},
    entryOn(venusHub.bundle, ActivityBundleItemType.PlayerTrigger, 153,
      encodeExact(bw => PlayerTriggerAuth.encode(bw, {flag: true, unk: 0})), false)];
}

export function buildVenusSouthernArrivalEntries(): SensorAuthSenseEntry[] {
  return [buildVenusPlayerObjectiveEntry(64, 1),
    // r393 live pool: 517641F1/24/56, auth80800634, owner23 remains
    // initialPending. Default-only initialization avoids the incomplete
    // kind33 encoder; the resource contains the invincibility activity pattern.
    entryOn(venusHub.bundle, ActivityBundleItemType.Unknown24, 56, null, true),
    entryOn(venusHub.bundle, ActivityBundleItemType.PlayerTrigger, 147,
      encodeExact(bw => PlayerTriggerAuth.encode(bw, { flag: true, unk: 0 })), false)]
    .map(entry => ({ ...entry, nativeBodyFraming: false }));
}

/** Actual trigger147 -> authored interactable object and objective. */
export function buildVenusSouthernInteractionEntries(): SensorAuthSenseEntry[] {
  const body = encodeExact(bw => {
    // 808005EF prefix, followed by one 8080053D command. Preserve the
    // generic empty ObjectAuth encoder used by all other destinations.
    bw.write(0x80000001, 32);
    bw.writeBit(1);
    SensorClientRef.encode(bw, UNSET_CLIENT_REF);
    bw.write(1, 4);
    // Kind33 decoder836A2A20 reads 80800034 (present + raw schema hash),
    // then decodes that schema's payload. 8381C478 consumes80802DA2.
    bw.writeBit(1);
    bw.write(0x80802da2, 32);
    bw.write(3, 2); // mode2 + bias1: enable, not activation/completion
    SensorClientRef.encode(bw, UNSET_CLIENT_REF);
    bw.write(0x80000000, 32); // generation0; do not reset real interaction
    bw.writeBit(0); // no fabricated activated state
  });
  // Packaged Object8 has template+68=1 (networked). Native835C1AB4 requires
  // sense generation +3A0 < requested auth generation +100, then flag +104
  // before calling835C0DE0. r395 observed both generations zero: no creation.
  return [buildVenusPlayerObjectiveEntry(64, 0),
    buildVenusPlayerObjectiveEntry(57, 1),
    { ...entryOn(0x0a6d9003, ActivityBundleItemType.Object, 8, body, true),
      nativeBodyFraming: true }];
}

/** Actual device use retires its objective and starts authored kill_warpgates. */
export function buildVenusDeviceCompletionEntries(gateCount = 0, defeatedGates: readonly number[] = []): SensorAuthSenseEntry[] {
  // These are the phase02 utility instances. Public Southern Actors62..68
  // are separate copies and are not loaded by the Chapter2 scenario.
  // 835B50F0 requires flag+6, mode+5 !=1/3, and no existing unit.
  const body = encodeExact(bw => ActorAuth.encode(bw, {
    unk0: 1, unk1: 0, unk2: 0, flag3: true,
    nest4: undefined, nest5: undefined, script: undefined, nest7: undefined,
  }));
  const gates = [70, 72, 74, 76].map(index => ({
    ...entryOn(venusHub.bundle, ActivityBundleItemType.Actor, index, body, true),
    nativeBodyFraming: true,
  }));
  return [buildVenusPlayerObjectiveEntry(57, 0), ...buildVenusGateProgressEntries(gateCount, defeatedGates),
    {...entryOn(venusHub.bundle,ActivityBundleItemType.Objective,24,encodeObjectiveActivationAuth(),true),nativeBodyFraming:true},...gates];
}

/** `gate` is the owning warpgate Actor; `wave` is its ordinal at that gate, so
 * reinforcements can be released a wave at a time per still-standing gate
 * instead of all fourteen squads arriving in one packet. */
export const VENUS_SOUTHERN_WARPGATE_WAVES = [
  // Gate 00 (Actor 70): SquadGroup 333 (0x4c2dada4), FiringAreaSet 234 (0x67a7ba11)
  { squad: 25, population: [3], group: 333, area: 234, gate: 70, wave: 0 },
  { squad: 26, population: [2, 1], group: 333, area: 234, gate: 70, wave: 1 },
  // Gate 01 (Actor 72): SquadGroup 334 (0x4c2dada5), FiringAreaSet 235 (0x67a7ba12)
  { squad: 27, population: [3, 1], group: 334, area: 235, gate: 72, wave: 0 },
  { squad: 28, population: [2, 1], group: 334, area: 235, gate: 72, wave: 1 },
  { squad: 29, population: [2, 1], group: 334, area: 235, gate: 72, wave: 2 },
  { squad: 30, population: [2, 1], group: 334, area: 235, gate: 72, wave: 3 },
  // Gate 02 (Actor 74): SquadGroup 335 (0x4c2dada7), FiringAreaSet 236 (0x67a7ba13)
  { squad: 31, population: [4], group: 335, area: 236, gate: 74, wave: 0 },
  { squad: 32, population: [2, 1], group: 335, area: 236, gate: 74, wave: 1 },
  { squad: 33, population: [3], group: 335, area: 236, gate: 74, wave: 2 },
  { squad: 34, population: [2, 1], group: 335, area: 236, gate: 74, wave: 3 },
  // Gate 03 (Actor 76): SquadGroup 335 (0x4c2dada7), FiringAreaSet 237 (0x67a7ba14)
  { squad: 35, population: [3, 1], group: 335, area: 237, gate: 76, wave: 0 },
  { squad: 36, population: [2, 1], group: 335, area: 237, gate: 76, wave: 1 },
  { squad: 37, population: [3], group: 335, area: 237, gate: 76, wave: 2 },
  { squad: 38, population: [2, 1], group: 335, area: 237, gate: 76, wave: 3 },
] as const;

/** Highest wave ordinal authored at any single gate. */
export const VENUS_SOUTHERN_WARPGATE_WAVE_COUNT =
  Math.max(...VENUS_SOUTHERN_WARPGATE_WAVES.map(row => row.wave)) + 1;

/** One wave ordinal across the gates still standing. Gates already destroyed
 * send nothing further, so reinforcements stop with the gate that fed them. */
export function buildVenusSouthernWarpgateWave(
  wave: number,
  defeatedGates: readonly number[] = [],
  initialPlacement = false
): SensorAuthSenseEntry[] {
  return buildVenusSouthernWarpgateWaveEntries(initialPlacement,
    row => row.wave === wave && !defeatedGates.includes(row.gate));
}

/** Squads belonging to one wave ordinal at the gates still standing. */
export function venusSouthernWarpgateWaveSquads(
  wave: number,
  defeatedGates: readonly number[] = []
): number[] {
  return VENUS_SOUTHERN_WARPGATE_WAVES
    .filter(row => row.wave === wave && !defeatedGates.includes(row.gate))
    .map(row => row.squad);
}

/** Authored warpgate reinforcement waves (Squads 25..38) at the four transfer gates. */
export function buildVenusSouthernWarpgateWaveEntries(
  initialPlacement = false,
  select: (row: typeof VENUS_SOUTHERN_WARPGATE_WAVES[number]) => boolean = () => true
): SensorAuthSenseEntry[] {
  const bundle = 0x517641f1;
  const entries: SensorAuthSenseEntry[] = [];
  for (const wave of VENUS_SOUTHERN_WARPGATE_WAVES.filter(select)) {
    const entry = entryOn(bundle, ActivityBundleItemType.Squad, wave.squad,
      encodeSquadAuth(wave.population.length, wave.population, {
        group: { bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: wave.group },
        firingAreaSet: { bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: wave.area },
      }), true,
      initialPlacement ? encodeSquadSense(wave.population.length, true, wave.population) : undefined);
    entry.nativeBodyFraming = true;
    if (initialPlacement) {
      entry.isSenseUpdateRelative = false;
      entry.senseStateSequence = 0;
    }
    entries.push(entry);
  }
  return entries;
}

/** Host133 populations and script14 sc_spawn_guards, lines51..57: native
 * placement at Northern arrival. These guards are separate from portal drops. */
export function buildVenusNorthernAmbientEntries(initial=false):SensorAuthSenseEntry[] {
  const bundle=0xee5b8c2a;
  const entries=[entryOn(bundle,ActivityBundleItemType.Objective,0,encodeObjectiveActivationAuth(),true,
    initial?encodeObjectiveReceivedState():undefined),
    ...[3,3,2,2,3,3,1].map((population,i)=>entryOn(bundle,ActivityBundleItemType.Squad,i+1,
      encodeSquadAuth(1,[population]),true,initial?encodeSquadSense(1,true,[population]):undefined))];
  return entries.map(e=>({...e,nativeBodyFraming:true,...(initial?{isSenseUpdateRelative:false,senseStateSequence:0}:{})}));
}

export function buildVenusSouthernPortalSquad(squad:number,cycle=1):SensorAuthSenseEntry {
  const row=VENUS_SOUTHERN_WARPGATE_WAVES.find(w=>w.squad===squad)??NORTHERN_PORTAL_WAVES.find(w=>w.squad===squad);
  if(!row||!Number.isInteger(cycle)||cycle<1||cycle>10000)throw Error('Invalid portal squad allocation');
  return {...entryOn(venusHub.bundle,ActivityBundleItemType.Squad,squad,
    encodeSquadAuth(row.population.length,row.population.map(n=>n*cycle),{
      group:{bundle:venusHub.bundle,typeId:ActivityBundleItemType.SquadGroup,typeIndex:row.group},
      ...('area' in row?{firingAreaSet:{bundle:venusHub.bundle,typeId:ActivityBundleItemType.FiringAreaSet,typeIndex:row.area}}:{}),
    }),true),nativeBodyFraming:true};
}

// Script32 utility-gate squads. Placement belongs to the gate's drop context.
const NORTHERN_PORTAL_WAVES=[
  {gate:129,squad:104,population:[2,1],group:352},
  ...[105,106,107].map(squad=>({gate:129,squad,population:[2],group:352})),
  ...[108,109,110].map(squad=>({gate:131,squad,population:[2],group:353})),
  {gate:131,squad:111,population:[1],group:353},
];

/** Packaged phase02 sniper placements. Host78 +26074..262CC owns these
 * populations and Objective24. Two zero-population squads have named actors;
 * they must not receive an extra anonymous population. Only the initial
 * activation sends placement sense; refreshes retain native deaths.
 */
export function buildVenusSouthernSniperEntries(initialPlacement = false): SensorAuthSenseEntry[] {
  const bundle = 0x517641f1;
  const entries = [entryOn(bundle, ActivityBundleItemType.Objective, 24,
    encodeObjectiveActivationAuth(), true,
    initialPlacement ? encodeObjectiveReceivedState() : undefined)];
  for (const squad of [39, 41, 43, 44, 45, 46, 47]) {
    const population = [squad < 43 ? 0 : 1];
    const entry = entryOn(bundle, ActivityBundleItemType.Squad, squad,
      encodeSquadAuth(1, population, {
        group: {
          bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: 336,
        },
        firingAreaSet: {
          bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: 238,
        },
      }), true,
      initialPlacement ? encodeSquadSense(1, true, population) : undefined);
    entry.nativeBodyFraming = true;
    if (initialPlacement) {
      entry.isSenseUpdateRelative = false;
      entry.senseStateSequence = 0;
    }
    entries.push(entry);
  }
  const actorBody = encodeExact(bw => ActorAuth.encode(bw, {
    unk0: 1, unk1: 0, unk2: 0, flag3: true,
    nest4: undefined, nest5: undefined, script: undefined, nest7: undefined,
  }));
  for (const actor of [40, 42]) entries.push({
    ...entryOn(bundle, ActivityBundleItemType.Actor, actor, actorBody, true),
    nativeBodyFraming: true,
  });
  entries[0].nativeBodyFraming = true;
  if (initialPlacement) {
    entries[0].isSenseUpdateRelative = false;
    entries[0].senseStateSequence = 0;
  }
  return entries;
}

/** Actual four-gate defeat retires Southern's objective; no travel or reward credit. */
export function buildVenusGateProgressEntries(count: number, defeatedGates: readonly number[] = []): SensorAuthSenseEntry[] {
  if (!Number.isInteger(count) || count < 0 || count > 4) throw new Error('Invalid gate count');
  return count < 4
    ? [buildVenusPlayerObjectiveEntry(60, 1, count, 4, defeatedGates)]
    : [buildVenusPlayerObjectiveEntry(60, 0), buildVenusPlayerObjectiveEntry(112, 1)];
}

/** Cumulative allocation only: preserve the client's actual defeated roster. */
export function buildVenusHeadlandsReplenishmentEntry(squad: number, allocation: number): SensorAuthSenseEntry {
  const encounter = HEADLANDS_GROUND_ENCOUNTERS.find(row => row.squad === squad);
  if (!encounter || !Number.isSafeInteger(allocation) || allocation < encounter.population[0]) {
    throw new Error('Invalid Headlands replenishment');
  }
  const bundle = 0xb9d50318;
  const entry = entryOn(bundle, ActivityBundleItemType.Squad, squad,
    encodeSquadAuth(1, [allocation], { group: {
      bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: encounter.group,
    }, firingAreaSet: {
      bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: encounter.area,
    } }), true);
  entry.nativeBodyFraming = true;
  return entry;
}

/** 00dc host111 populations; host-high9 script lines44..51.
 * Each squad has one template category, with its own packaged spawn region.
 * Do not reuse the Captain's platform-only firing-area override for minions.
 */
export function buildVenusOpeningMinionEntries(reinforcements = false): SensorAuthSenseEntry[] {
  const bundle = 0x44fb7aa2;
  const rows = reinforcements
    ? [{squad: 4, population: 3}, {squad: 5, population: 3}]
    : [{squad: 3, population: 4, group: 80}, {squad: 6, population: 3},
       {squad: 7, population: 1, group: 81}, {squad: 8, population: 1, group: 81}];
  return rows.map(row => ({
    ...entryOn(bundle, ActivityBundleItemType.Squad, row.squad,
      encodeSquadAuth(1, [row.population], 'group' in row && row.group !== undefined
        ? {group: {bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: row.group}} : {}),
      true, encodeSquadSense(1, true, [row.population])),
    nativeBodyFraming: true, isSenseUpdateRelative: false, senseStateSequence: 0,
  }));
}

/** Native pt_reinf uses the PlayerTrigger emitter; enable its packaged volume. */
export function buildVenusOpeningReinforcementTrigger(): SensorAuthSenseEntry {
  return {...entryOn(0x44fb7aa2, ActivityBundleItemType.PlayerTrigger, 35,
    encodeExact(bw => PlayerTriggerAuth.encode(bw, {flag: true, unk: 0})), false),
    nativeBodyFraming: true};
}

/** Preserve native casualties across refresh; never replay initial Sense allocations. */
export function preserveVenusOpeningApply(entries: SensorAuthSenseEntry[], reinforcements: boolean): SensorAuthSenseEntry[] {
  const allocated = reinforcements ? [3,4,5,6,7,8] : [3,6,7,8];
  return [...entries.filter(entry => !(entry.clientRef.bundle === 0x44fb7aa2 &&
    ((entry.clientRef.typeId === ActivityBundleItemType.Squad && allocated.includes(entry.clientRef.typeIndex)) ||
     (entry.clientRef.typeId === ActivityBundleItemType.PlayerTrigger && entry.clientRef.typeIndex === 35)))),
    buildVenusOpeningReinforcementTrigger()];
}

/** Native entrance captain: one authored member, not an entity-index alias. */
export function buildVenusCaptainActivationEntries(): SensorAuthSenseEntry[] {
  const tag = activityBundleForSlice('venus_chapter_2', 8);
  if (tag?.bundle !== 0x44fb7aa2 ||
      !tag.rows.some(row => row.typeId === ActivityBundleItemType.Squad && row.typeIndex === 1)) {
    throw new Error('Authored Venus captain bundle unavailable');
  }
  const objective = entryOn(tag.bundle, ActivityBundleItemType.Objective, 0,
    encodeObjectiveActivationAuth(), true, encodeObjectiveReceivedState());
  const captain = entryOn(tag.bundle, ActivityBundleItemType.Squad, 1,
    encodeSquadAuth(1, [1], { group: {
      bundle: tag.bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: 80,
      }, firingAreaSet: {
        // Packaged set54 contains only the platform under the captain's authored spawn.
        bundle: tag.bundle, typeId: ActivityBundleItemType.FiringAreaSet, typeIndex: 54,
      } }), true, encodeSquadSense(1, true, [1]));
  for (const entry of [objective, captain]) {
    entry.nativeBodyFraming = true;
    entry.isSenseUpdateRelative = false;
    entry.senseStateSequence = 0;
  }
  return [objective, captain, buildVenusOpeningObjectiveEntry()];
}

/**
 * Phase A for Action Mock's complete regular encounter family. The decoded
 * root tag proves Squads 2-5 share relationship key D8F96A96 with
 * EncounterBinding 116; Squad 1 belongs to the separate boss binding.
 */
function actionMockSquadEntries(tag: ActivityBundleTag): SensorAuthSenseEntry[] {
  return rowsOf(tag, ActivityBundleItemType.Squad)
    .filter((row) => ACTION_MOCK_REGULAR_SQUADS.has(row.typeIndex))
    .map((squad) =>
      entryOn(
      tag.bundle,
      ActivityBundleItemType.Squad,
      squad.typeIndex,
      encodeSquadAuth(1, [], {
        firingAreaSet: ACTION_MOCK_ROOT_OBJECTIVE_REF,
      }),
      true,
      encodeSquadSense(1, false)
      )
    );
}

/** Receive and activate Action Mock's package-authored root objective. */
export function buildActionMockObjectiveActivationSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  const objective = actionMock.rows.find(
    (row) =>
      row.typeId === ActivityBundleItemType.Objective && row.typeIndex === 0
  );
  if (!objective) {
    return [];
  }
  const entry = entryOn(
    actionMock.bundle,
    ActivityBundleItemType.Objective,
    objective.typeIndex,
    encodeObjectiveActivationAuth(),
    true,
    encodeObjectiveReceivedState()
  );
  entry.nativeBodyFraming = true;
  entry.isSenseUpdateRelative = false;
  entry.senseStateSequence = senseStateSequence;
  return [entry];
}

/** Make Action Mock's complete regular relationship family live. */
export function buildActionMockSquadActivationSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  return actionMock.rows
    .filter(
      (row) =>
        row.typeId === ActivityBundleItemType.Squad &&
        ACTION_MOCK_REGULAR_SQUADS.has(row.typeIndex)
    )
    .map((squad) => {
      const entry = entryOn(
        actionMock.bundle,
        ActivityBundleItemType.Squad,
        squad.typeIndex,
        encodeSquadAuth(1, ACTION_MOCK_REGULAR_SQUAD_ROSTER, {
          firingAreaSet: ACTION_MOCK_ROOT_OBJECTIVE_REF,
        }),
        true,
        encodeSquadSense(1, true, ACTION_MOCK_REGULAR_SQUAD_ROSTER)
      );
      entry.nativeBodyFraming = true;
      entry.isSenseUpdateRelative = false;
      entry.senseStateSequence = senseStateSequence;
      return entry;
    });
}

/**
 * One-shot Phase B placement for the first native Chapter 2 Vex encounter.
 * Phase A in the normal slice apply creates the encounter objective without a
 * received sense state and both live one-member rosters with valid=0. This
 * later absolute update receives objective 1 and flips both rosters to valid=1.
 */
export function buildVenusVexActivationSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  const tag = activityBundleForSlice(
    "venus_chapter_2",
    VENUS_CHAPTER_2_INITIAL_SLICE
  );
  const squads = tag?.rows.filter(
    (row) =>
      row.typeId === ActivityBundleItemType.Squad &&
      VENUS_CHAPTER_2_FIRST_VEX_ROSTERS.has(row.typeIndex)
  );
  const objective = tag?.rows.find(
    (row) =>
      row.typeId === ActivityBundleItemType.Objective && row.typeIndex === 1
  );
  if (
    !tag ||
    !objective ||
    squads?.length !== VENUS_CHAPTER_2_FIRST_VEX_ROSTERS.size
  ) {
    return [];
  }

  const objectiveBody = encodeObjectiveActivationAuth();
  const objectiveReceivedState = encodeObjectiveReceivedState();
  const objectiveEntry = entryOn(
    tag.bundle,
    ActivityBundleItemType.Objective,
    objective.typeIndex,
    objectiveBody,
    true,
    objectiveReceivedState
  );
  objectiveEntry.nativeBodyFraming = true;
  objectiveEntry.isSenseUpdateRelative = false;
  objectiveEntry.senseStateSequence = senseStateSequence;

  const squadEntries = squads.map((squad) => {
    const roster = VENUS_CHAPTER_2_FIRST_VEX_ROSTERS.get(squad.typeIndex);
    if (!roster) {
      throw new Error(`Venus Vex roster unavailable squad=${squad.typeIndex}`);
    }
    const entry = entryOn(
      tag.bundle,
      ActivityBundleItemType.Squad,
      squad.typeIndex,
      encodeSquadAuth(
        1,
        roster,
        VENUS_CHAPTER_2_FIRST_VEX_REFS
      ),
      true,
      encodeSquadSense(1, true, roster)
    );
    entry.nativeBodyFraming = true;
    entry.isSenseUpdateRelative = false;
    entry.senseStateSequence = senseStateSequence;
    return entry;
  });
  return [objectiveEntry, ...squadEntries];
}

/**
 * Replay the byte-for-byte shape proven to commit both first-encounter squads.
 * Keep the objective out of this update: the client may reject its row before
 * iterating the later squad rows.
 */
export function buildVenusVexSquadActivationSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  return buildVenusVexActivationSenseEntries(senseStateSequence).filter(
    (entry) => entry.clientRef.typeId === ActivityBundleItemType.Squad
  );
}

/** Send the first encounter objective only after the squad commit is observed. */
export function buildVenusVexObjectiveActivationSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  return buildVenusVexActivationSenseEntries(senseStateSequence).filter(
    (entry) => entry.clientRef.typeId === ActivityBundleItemType.Objective
  );
}

/**
 * Mark the first Vex encounter's PlayerMonitor as received without asserting
 * either unknown monitor flag. This exposes the native callback path while
 * preserving authored trigger-volume semantics.
 */
export function buildVenusVexPlayerMonitorReceivedSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  const tag = activityBundleForSlice(
    "venus_chapter_2",
    VENUS_CHAPTER_2_INITIAL_SLICE
  );
  const monitor = tag?.rows.find(
    (row) =>
      row.typeId === ActivityBundleItemType.PlayerMonitor &&
      row.typeIndex === 33
  );
  if (!tag || !monitor) {
    return [];
  }
  const entry = entryOn(
    tag.bundle,
    ActivityBundleItemType.PlayerMonitor,
    monitor.typeIndex,
    encodePlayerMonitorAuth(),
    true,
    encodePlayerMonitorSense()
  );
  entry.nativeBodyFraming = true;
  entry.isSenseUpdateRelative = false;
  entry.senseStateSequence = senseStateSequence;
  return [entry];
}

/**
 * One-shot Phase B placement for the Tower plaza Postmaster squad. The normal
 * slice apply creates its native two-member roster with valid=0; this absolute
 * update marks only that roster valid after the client acknowledges the slice.
 */
export function buildTowerPostmasterActivationSenseEntries(
  senseStateSequence = 0
): SensorAuthSenseEntry[] {
  return buildTowerVendorActivationSenseEntries(
    TOWER_PLAZA_SLICE,
    senseStateSequence
  ).filter((entry) => entry.clientRef.typeIndex === TOWER_POSTMASTER_SQUAD);
}

/**
 * One-shot Phase B placement for every authored vendor squad in a Tower slice.
 * The activity bundle owns their world positions; this only makes the staged
 * native rosters live after the client acknowledges the slice.
 */
export function buildTowerVendorActivationSenseEntries(
  slice: number,
  senseStateSequence = 0,
  includeAmbient = false
): SensorAuthSenseEntry[] {
  const tag = activityBundleForSlice(
    towerFah.activityName,
    slice
  );
  const vendorRosters = tag && (includeAmbient ? towerNpcRosters(tag.bundle) : TOWER_VENDOR_ROSTERS.get(tag.bundle));
  if (!tag || !vendorRosters) {
    return [];
  }

  const counts = SQUAD_COUNTS.get(tag.bundle);
  const squads = rowsOf(tag, ActivityBundleItemType.Squad)
    .filter((row) => vendorRosters.has(row.typeIndex))
    .map((row) => {
      const count = counts?.get(row.typeIndex) ?? 1;
      const slots = vendorRosters.get(row.typeIndex) ?? [];
      if (slots.length !== count) {
        throw new Error(
          `Tower vendor roster mismatch bundle=0x${tag.bundle.toString(16)} ` +
            `squad=${row.typeIndex} expected=${count} actual=${slots.length}`
        );
      }
      const entry = entryOn(
        tag.bundle,
        ActivityBundleItemType.Squad,
        row.typeIndex,
        encodeSquadAuth(count, slots),
        true,
        encodeSquadSense(count, true, slots)
      );
      // Native 8376EC30: prefix 0 decodes this auth body; prefix 1 resets it.
      // Restore the Tower-specific framing verified in the r361 experiment.
      entry.nativeBodyFraming = true;
      entry.isSenseUpdateRelative = false;
      entry.senseStateSequence = senseStateSequence;
      return entry;
    });
  if (!includeAmbient) return squads;
  // Authored named actors have zero anonymous population. Materialize their
  // own Actor refs rather than adding anonymous copies to the squad roster.
  const actorBody = encodeExact(bw => ActorAuth.encode(bw, {
    unk0:1, unk1:0, unk2:0, flag3:true,
    nest4:undefined, nest5:undefined, script:undefined, nest7:undefined,
  }));
  const actorIds = towerNpcPopulations.filter(row => parseInt(row.bundle,16) === tag.bundle)
    .flatMap(row => row.actors);
  const authoredActors = new Set(rowsOf(tag,ActivityBundleItemType.Actor).map(row => row.typeIndex));
  if (new Set(actorIds).size !== actorIds.length || actorIds.some(id => !authoredActors.has(id))) {
    throw new Error('Tower named-actor reference mismatch');
  }
  return [...squads, ...actorIds.map(id => ({
    ...entryOn(tag.bundle,ActivityBundleItemType.Actor,id,actorBody,true),
    nativeBodyFraming:true,
  }))];
}

function towerNpcRosters(bundle: number): ReadonlyMap<number, readonly number[]> {
  return new Map(towerNpcPopulations.filter(row => parseInt(row.bundle,16) === bundle)
    .map(row => [row.squad,row.population]));
}

/** Join grant: 809E2008 Lifetime + Player. Retail 261. */
const PVP_ACTIVITIES = new Set(['pvp_factory', 'pvp_greenhouse', 'pvp_marsbattle']);

function buildPvpBindingEntries(playerKey: bigint, activityName: string, grant: boolean): SensorAuthSenseEntry[] {
  const entries: SensorAuthSenseEntry[] = [];
  // Native C2DACAF7 globals, 39774EE1 gameplay and EAAF16E2 players.
  // Factory live capture has 53 Auth rows plus one sense-only TeamPicker.
  for (const tag of ACTIVITY_BUNDLE_TAGS) {
    if (tag.activityName !== activityName || (grant && tag.bundle !== 0xc2dacaf7)) continue;
    for (const row of tag.rows) {
      if (grant && row.typeId !== ActivityBundleItemType.Lifetime && row.typeId !== ActivityBundleItemType.Player) continue;
      if (row.typeId === ActivityBundleItemType.TeamPicker) {
        // Native 80802E01 -> 80802E00: four-bit count, then that many
        // 80802DFF entries. Captured initial state is empty (count 0).
        const sense = encodeExact(bw => bw.write(0, 4));
        entries.push({
          ...entryOn(tag.bundle, row.typeId, row.typeIndex, null, true, sense),
          authSchemaBound: false, nativeBodyFraming: true,
          isSenseUpdateRelative: false,
        });
        continue;
      }
      let body: FinishedBits;
      let senseBound = false;
      switch (row.typeId) {
        case ActivityBundleItemType.Lifetime: body = encodeLifetimeAuth(2, activityName); break;
        // Native initial PvP spawns use multiplayer team index + 16
        // (8294C060); team 0 is cooperative and matches no PvP spawn.
        // This local host has one player. Native globals reserve slots 4..15;
        // binding the same key to all twelve aliases the player and its Sense.
        // Native835BE6A4..6DC treats an all-zero key as an unoccupied slot and
        // skips the player/team update. Still acknowledge every pending row.
        case ActivityBundleItemType.Player:
          body = row.typeIndex === 4 && tag.bundle === 0xc2dacaf7
            ? encodePlayerAuth(playerKey, 16)
            : encodePlayerAuth(0n);
          senseBound = true;
          break;
        case ActivityBundleItemType.Scoreboard: body = encodeScoreboardAuth(); break;
        case ActivityBundleItemType.Timer: body = encodeTimerAuth(); break;
        case ActivityBundleItemType.Fireteam: body = encodeFireteamAuth(); break;
        case ActivityBundleItemType.Sequence: body = encodeSequenceAuth(); break;
        case ActivityBundleItemType.Cinematic: body = encodeCinematicAuth(); break;
        case ActivityBundleItemType.Object: body = encodeObjectAuth(); senseBound = true; break;
        case ActivityBundleItemType.PlayerObjective: body = encodePlayerObjectiveAuth(); break;
        case ActivityBundleItemType.ObjectFilter: body = encodeObjectFilterAuth(); break;
        default: continue;
      }
      entries.push(entryOn(tag.bundle, row.typeId, row.typeIndex, body, senseBound));
    }
  }
  return entries;
}

export function buildTowerBinderSenseEntries(
  playerKey: bigint,
  activityName = towerFah.activityName
): SensorAuthSenseEntry[] {
  if (PVP_ACTIVITIES.has(activityName)) return buildPvpBindingEntries(playerKey, activityName, true);
  const type12 = encodePlayerAuth(playerKey);
  const otherPlayer = activityName === 'action_mock' ? encodePlayerAuth(0n) : type12;
  return [
    ...someRows(
      towerStory,
      ActivityBundleItemType.Lifetime,
      encodeLifetimeAuth(2, activityName),
      false
    ),
    ...rowsOf(towerStory, ActivityBundleItemType.Player).map(row =>
      // Action's native story_common declares players[0] at index5. Its live
      // initial Sense echoed all16 slots when one identity was bound to each.
      // Preserve acknowledgements; native835BE6A4 skips zero-key slots.
      entryOn(towerStory.bundle, row.typeId, row.typeIndex,
        row.typeIndex === 5 ? type12 : otherPlayer, true)),
  ];
}

const VENUS_CHAPTER_2_PLAYER_TRIGGER_INDICES = new Set([
  0x86, 0x8a, 0x8b, 0x94, 0x95,
]);

/**
 * Chapter 2's live registry contains the 517641F1 hub subset below plus the
 * 16 EAAF16E2 player rows. These 72 refs are distinct from the 4786C0E0
 * story and 8CC31436 slice rows and must be acknowledged in the same apply.
 */
export function buildVenusRegistrySenseEntries(
  playerKey: bigint
): SensorAuthSenseEntry[] {
  const triggerBody = encodePlayerTriggerAuth();
  return [
    ...someRows(
      venusHub,
      ActivityBundleItemType.Sequence,
      encodeSequenceAuth(),
      false
    ),
    ...someRows(
      venusHub,
      ActivityBundleItemType.Cinematic,
      encodeCinematicAuth(),
      false
    ),
    ...someRows(
      venusHub,
      ActivityBundleItemType.Health,
      encodeHealthAuth(),
      true
    ),
    ...rowsOf(venusHub, ActivityBundleItemType.PlayerTrigger)
      .filter((row) =>
        VENUS_CHAPTER_2_PLAYER_TRIGGER_INDICES.has(row.typeIndex)
      )
      .map((row) =>
        entryOn(
          venusHub.bundle,
          ActivityBundleItemType.PlayerTrigger,
          row.typeIndex,
          triggerBody,
          false
        )
      ),
    ...someRows(
      venusHub,
      ActivityBundleItemType.ObjectFilter,
      encodeObjectFilterAuth(),
      false
    ),
    ...someRows(venusHub, ActivityBundleItemType.Loot, encodeLootAuth(), false),
    ...someRows(
      venusPlayers,
      ActivityBundleItemType.Player,
      encodePlayerAuth(playerKey),
      true
    ),
  ];
}

/** Native Patrol capture r576: global loot and the loaded Shattered Coast trigger.
 * PlayerObjectives are initialized by the Patrol leftover bundle below.
 * Other area triggers require their own observed owner binding.
 */
function buildVenusPatrolBindingEntries(playerKey: bigint, slice: number): SensorAuthSenseEntry[] {
  return [
    ...someRows(venusPlayers, ActivityBundleItemType.Player, encodePlayerAuth(playerKey), true),
    ...someRows(patrolHub, ActivityBundleItemType.Loot, encodeLootAuth(), false),
    ...(slice === 21 ? rowsOf(patrolHub, ActivityBundleItemType.PlayerTrigger)
      .filter(row => row.typeIndex === 17)
      .map(row => entryOn(patrolHub.bundle, row.typeId, row.typeIndex, encodePlayerTriggerAuth(), false)) : []),
  ];
}

/** Native portal registry: only its global and currently loaded owner rows.
 * Initial binding supplies no encounter placement or mission completion.
 */
export function buildVenusStrikeBindingEntries(playerKey: bigint, slice: number): SensorAuthSenseEntry[] {
  // EAAF16E2 is the shared physical Player bundle, separate from the main
  // strike registry. r416 live capture found all 16 PlayerAuth rows still
  // initial-pending: omitting them blocks apply and Guardian creation.
  const entries: SensorAuthSenseEntry[] = someRows(
    venusPlayers, ActivityBundleItemType.Player, encodePlayerAuth(playerKey), true
  );
  for (const row of strikeRows) {
    if ((row.owner !== 0xffffffff && row.owner !== slice) || row.bundle === '4786C0E0') continue;
    const bundle = parseInt(row.bundle, 16);
    let body: FinishedBits | null;
    let sense: FinishedBits | undefined;
    let senseBound = false;
    switch (row.typeId) {
      case ActivityBundleItemType.Squad: {
        const squad = strikeSquads.find(s => s.bundle === row.bundle && s.squad === row.typeIndex);
        if (!squad || squad.memberCount < 1 || squad.memberCount > 8) throw new Error('Strike squad template unavailable');
        body = encodeSquadAuth(squad.memberCount);
        sense = encodeSquadSense(squad.memberCount, false);
        senseBound = true;
        break;
      }
      case ActivityBundleItemType.Player: body = encodePlayerAuth(playerKey); senseBound = true; break;
      case ActivityBundleItemType.Sequence: body = encodeSequenceAuth(); break;
      case ActivityBundleItemType.Health: body = encodeHealthAuth(); senseBound = true; break;
      case ActivityBundleItemType.Objective: body = encodeObjectiveAuth(); senseBound = true; break;
      case ActivityBundleItemType.Object: body = encodeObjectAuth(); senseBound = true; break;
      case ActivityBundleItemType.PlayerMonitor: body = encodePlayerMonitorAuth(); senseBound = true; break;
      case ActivityBundleItemType.PlayerTrigger:
        body = encodeExact(bw => PlayerTriggerAuth.encode(bw, {
          flag: row.bundle === '0A302429' && row.typeIndex === 74, unk: 0,
        }));
        break;
      case ActivityBundleItemType.PlayerObjective: body = encodePlayerObjectiveAuth(); break;
      case ActivityBundleItemType.Timer: body = encodeTimerAuth(); break;
      case ActivityBundleItemType.ObjectFilter: body = encodeObjectFilterAuth(); break;
      case ActivityBundleItemType.SafeZone: body = encodeSafeZoneAuth(); senseBound = true; break;
      case ActivityBundleItemType.Loot: body = encodeLootAuth(); break;
      case ActivityBundleItemType.Actor: body = null; senseBound = true; break;
      default: continue;
    }
    entries.push(entryOn(bundle, row.typeId, row.typeIndex, body, senseBound, sense));
  }
  return entries;
}

/** Direct children assigned in native script63 main+878..B20, resolved through
 * its import names and global mission 0A302429 registry. Host154+145F8..14D00
 * owns the population vectors; their lengths match the native client templates.
 * This is an encoder catalog, not a spawn list: mission1 actually places only
 * targets19/16/17/18; merely encoding support for13/14/15/20 does not spawn them.
 */
const STRIKE_ENGINEERING_SQUAD_PLACEMENTS: Readonly<Record<number, {
  group: number; population: readonly number[];
}>> = {
  2: {group:165,population:[3,3]}, 3: {group:165,population:[3,3]},
  4: {group:166,population:[2,2,2]}, 5: {group:166,population:[2,0,0,4]},
  6: {group:171,population:[2,0,0,2]},
  7: {group:167,population:[3,0,0,3]}, 8: {group:167,population:[3,0,3]},
  9: {group:172,population:[1,3]},
  10: {group:168,population:[0,2,4]}, 11: {group:168,population:[3,3]},
  12: {group:173,population:[3,1]},
  13: {group:170,population:[1]}, 14: {group:170,population:[1]},
  15: {group:171,population:[1]}, 16: {group:171,population:[1]},
  17: {group:172,population:[1]}, 18: {group:172,population:[1]},
  19: {group:173,population:[1]}, 20: {group:173,population:[1]},
};

/** Initial placement sends the paired Sense initialization exactly once. A
 * supplied cumulativePopulation sends Auth allocation only, retaining native
 * Sense roster/death state. It is the total requested allocation per authored
 * member category, not alive counts, a new-wave delta, or inferred deaths.
 * Caller owns cumulative accounting and must never reapply initial Sense on
 * a refill. Native respawn survivor/replenishment policy remains unverified.
 * No firing-area override appears in floor_spawn; Objective1 is separate.
 */
export function buildVenusStrikeEngineeringSquadEntry(
  squad: number, cumulativePopulation?: readonly number[],
): SensorAuthSenseEntry {
  const placement = STRIKE_ENGINEERING_SQUAD_PLACEMENTS[squad];
  if (!Number.isInteger(squad) || !placement) throw new Error('Not an authored Engineering squad');
  const template = strikeSquads.find(row => row.bundle === '0A302429' && row.squad === squad);
  const population = cumulativePopulation ?? placement.population;
  if (!template || template.memberCount !== placement.population.length
      || population.length !== template.memberCount
      || population.some((count,index) => !Number.isSafeInteger(count) || count > 0x7fffffff
        || count < placement.population[index] || (placement.population[index] === 0 && count !== 0))) {
    throw new Error('Invalid Engineering cumulative allocation or native template');
  }
  const bundle = 0x0a302429;
  const initialPlacement = cumulativePopulation === undefined;
  const entry = entryOn(bundle, ActivityBundleItemType.Squad, squad,
    encodeSquadAuth(template.memberCount, population, { group: {
      bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: placement.group,
    } }), true, initialPlacement ? encodeSquadSense(template.memberCount, true, population) : undefined);
  entry.nativeBodyFraming = true;
  if (initialPlacement) {
    entry.isSenseUpdateRelative = false;
    entry.senseStateSequence = 0;
  }
  return entry;
}

/** Preserve the proven initial-pair packet shape and strict accepted indexes. */
export function buildVenusStrikeFirstWaveSquadEntry(squad: 2 | 3): SensorAuthSenseEntry {
  if (squad !== 2 && squad !== 3) throw new Error("Not an initial Engineering squad");
  return buildVenusStrikeEngineeringSquadEntry(squad);
}

/**
 * 4786 / F2D leftover Some + current-slice type-2 None. Type-32 / 4 /
 * 27 / 33 Some is 835AE4B4 after plaza exists (2318B full leftover).
 */
export function buildTowerLeftoverSenseEntries(
  sliceTag?: ActivityBundleTag,
  activityName = towerFah.activityName,
  stageActionMockCombat = true
): SensorAuthSenseEntry[] {
  const isVenus = venusHub.activityNames?.includes(activityName) === true;
  const isActionMock = activityName === "action_mock";
  const activityHub = activityName === 'venus_portal_1' ? undefined
    : activityName === 'venus_bounty_1' ? patrolHub
    : isVenus ? venusHub : isActionMock ? undefined : towerHub;
  const type9 = encodeFireteamAuth();
  const type32 = encodePlayerObjectiveAuth();
  const type4 = encodeObjectAuth();
  const type27 = encodeSafeZoneAuth();
  const type33 = encodeObjectFilterAuth();
  return [
    ...someRows(
      towerStory,
      ActivityBundleItemType.Scoreboard,
      encodeScoreboardAuth(),
      false
    ),
    ...someRows(
      towerStory,
      ActivityBundleItemType.HardWipeGlobals,
      encodeHardWipeGlobalsAuth(),
      false
    ),
    ...someRows(
      towerStory,
      ActivityBundleItemType.Timer,
      encodeTimerAuth(),
      false
    ),
    ...someRows(towerStory, ActivityBundleItemType.Fireteam, type9, false),
    ...(activityHub
      ? someRows(activityHub, ActivityBundleItemType.Fireteam, type9, false)
      : []),
    ...(sliceTag
      ? [
          ...someRows(sliceTag, ActivityBundleItemType.SafeZone, type27, true),
          ...someRows(
            sliceTag,
            ActivityBundleItemType.ObjectFilter,
            type33,
            false
          ),
          ...(isVenus || (isActionMock && stageActionMockCombat)
            ? [
                ...someRows(
                  sliceTag,
                  ActivityBundleItemType.Objective,
                  encodeObjectiveAuth(),
                  true
                ),
                ...(isVenus
                  ? [
                      // The entrance's Health34 remains initial-pending without
                      // this grant; 8376DC18 then blocks every apply callback.
                      ...someRows(
                        sliceTag,
                        ActivityBundleItemType.Health,
                        encodeHealthAuth(),
                        true
                      ),
                      ...someRows(
                        sliceTag,
                        ActivityBundleItemType.PlayerMonitor,
                        encodePlayerMonitorAuth(),
                        true
                      ),
                      ...someRows(
                        sliceTag,
                        ActivityBundleItemType.Timer,
                        encodeTimerAuth(),
                        false
                      ),
                    ]
                  : []),
              ]
            : []),
        ]
      : []),
    ...(isActionMock && stageActionMockCombat
      ? [
          ...rowsOf(actionMock, ActivityBundleItemType.PlayerObjective)
            .filter(
              (row) => row.typeIndex === ACTION_MOCK_KILL_PLAYER_OBJECTIVE
            )
            .map((row) =>
              entryOn(
                actionMock.bundle,
                ActivityBundleItemType.PlayerObjective,
                row.typeIndex,
                type32,
                false
              )
            ),
          ...rowsOf(actionMock, ActivityBundleItemType.Sequence)
            .filter((row) => ACTION_MOCK_KILL_SEQUENCES.has(row.typeIndex))
            .map((row) =>
              entryOn(
                actionMock.bundle,
                ActivityBundleItemType.Sequence,
                row.typeIndex,
                encodeSequenceAuth(),
                false
              )
            ),
        ]
      : activityHub
        ? someRows(
            activityHub,
            ActivityBundleItemType.PlayerObjective,
            type32,
            false
          )
        : []),
    ...(sliceTag
      ? [
          ...someRows(sliceTag, ActivityBundleItemType.Object, type4, true),
          ...noneRows(sliceTag, ActivityBundleItemType.Actor, true),
        ]
      : []),
  ];
}

/**
 * Refresh apply for the current slice. Identity + leftover Some stay
 * for Alpha spawn; type-1 comes from ACTIVITY_SLICE_BUNDLE_HASHES.
 * Do not None the previous slice's type-1 — 8376DEB8 then AE4B4s.
 */
/** r549's live 87-row registry left these authored families initial-pending.
 * Initialize them in the first ready apply, without placing actors or advancing
 * objectives. The early join grant precedes this registry's construction.
 */
function buildActionMockInitialBindingEntries(playerKey: bigint): SensorAuthSenseEntry[] {
  return [
    ...buildTowerBinderSenseEntries(playerKey, actionMock.activityName),
    ...someRows(actionMock, ActivityBundleItemType.PlayerObjective, encodePlayerObjectiveAuth(), false),
    ...someRows(actionMock, ActivityBundleItemType.Sequence, encodeSequenceAuth(), false),
    ...someRows(actionMock, ActivityBundleItemType.Loot, encodeLootAuth(), false),
    ...someRows(actionMock, ActivityBundleItemType.PlayerTrigger, encodePlayerTriggerAuth(), false),
    ...rowsOf(actionMock, ActivityBundleItemType.Squad).filter(row => row.typeIndex === 1)
      .map(row => entryOn(actionMock.bundle, row.typeId, row.typeIndex,
        encodeSquadAuth(1, []), true, encodeSquadSense(1, false))),
  ];
}

export function buildTowerApplySenseEntries(
  playerKey: bigint,
  slice = towerFah.initialBubble,
  activityName = towerFah.activityName,
  stageTowerVendors = true,
  stageActionMockCombat = true,
  includeTowerAmbientNpcs = false
): SensorAuthSenseEntry[] {
  if (PVP_ACTIVITIES.has(activityName)) return buildPvpBindingEntries(playerKey, activityName, false);
  const isVenus = venusHub.activityNames?.includes(activityName) === true;
  const isActionMock =
    activityName === actionMock.activityName && slice === ACTION_MOCK_INITIAL_SLICE;
  const sliceTag = activityBundleForSlice(activityName, slice);
  let squadSenseEntries: SensorAuthSenseEntry[] = [];
  if (sliceTag) {
    squadSenseEntries = isVenus
      ? venusSquadEntries(sliceTag)
      : isActionMock
        ? stageActionMockCombat
          ? actionMockSquadEntries(sliceTag)
          : []
        : squadEntries(sliceTag, stageTowerVendors, activityName === 'city_tower_default1' && includeTowerAmbientNpcs);
  }
  const entries = [
    // Action initializes its pending binder during initial combat staging.
    // Subsequent refreshes must not replay Lifetime or Player initialization.
    ...(isActionMock ? [] : buildTowerBinderSenseEntries(playerKey, activityName)),
    ...(activityName === 'venus_portal_1' ? buildVenusStrikeBindingEntries(playerKey, slice)
      : activityName === 'venus_bounty_1' ? buildVenusPatrolBindingEntries(playerKey, slice)
      : isVenus ? buildVenusRegistrySenseEntries(playerKey) : []),
    // Packaged owner10 registrations: pt_headlands_md01, pt_headlands_ch2m2,
    // and ch2m2_enter_bubble._player_trigger. Unacknowledged rows block apply.
    ...(activityName === 'venus_chapter_2' && slice === 10 ? [135, 136, 137].map(index => {
      const entry = entryOn(venusHub.bundle, ActivityBundleItemType.PlayerTrigger,
        index, encodePlayerTriggerAuth(), false);
      entry.nativeBodyFraming = true;
      return entry;
    }) : []),
    // r353 native pool: these three entrance-owned rows still wait for
    // initialization. The gate decodes active64 to bubble8 (83619EB0).
    ...(activityName === 'venus_chapter_2' && slice === 8 && sliceTag?.bundle === 0x44fb7aa2
      ? [
          ...someRows(sliceTag, ActivityBundleItemType.PlayerTrigger,
            encodePlayerTriggerAuth(), false),
          ...rowsOf(venusHub, ActivityBundleItemType.PlayerTrigger)
            .filter((row) => row.typeIndex === 0x85)
            .map((row) => entryOn(venusHub.bundle,
              ActivityBundleItemType.PlayerTrigger, row.typeIndex,
              encodePlayerTriggerAuth(), false)),
          ...rowsOf(venusHub, ActivityBundleItemType.PlayerMonitor)
            .filter((row) => row.typeIndex === 0x84)
            .map((row) => entryOn(venusHub.bundle,
              ActivityBundleItemType.PlayerMonitor, row.typeIndex,
              encodePlayerMonitorAuth(), true)),
        ]
      : []),
    ...squadSenseEntries,
    ...buildTowerLeftoverSenseEntries(
      sliceTag,
      activityName,
      stageActionMockCombat
    ),
  ];
  if (isActionMock && stageActionMockCombat) {
    const key = (entry: SensorAuthSenseEntry) =>
      `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const present = new Set(entries.map(key));
    entries.push(...buildActionMockInitialBindingEntries(playerKey)
      .filter(entry => !present.has(key(entry))));
  }
  if (activityName !== 'city_tower_default1' || stageTowerVendors || !sliceTag) return entries;
  // Phase B already established these live NPCs. A same-slice apply must not
  // replay default auth/None actor rows and reset their native state.
  const activeSquads = includeTowerAmbientNpcs ? towerNpcRosters(sliceTag.bundle) : TOWER_VENDOR_ROSTERS.get(sliceTag.bundle);
  const activeActors = new Set(includeTowerAmbientNpcs ? towerNpcPopulations
    .filter(row => parseInt(row.bundle,16) === sliceTag.bundle).flatMap(row => row.actors) : []);
  return entries.filter(entry => !(entry.clientRef.bundle === sliceTag.bundle &&
      entry.clientRef.typeId === ActivityBundleItemType.Actor && activeActors.has(entry.clientRef.typeIndex)))
    .map(entry => entry.clientRef.bundle === sliceTag.bundle &&
      entry.clientRef.typeId === ActivityBundleItemType.Squad && activeSquads?.has(entry.clientRef.typeIndex)
      ? {...entry,nativeBodyFraming:true} : entry);
}

export function buildSensorAuthUpdateRsat(
  fields: SensorAuthUpdateFields = {}
): Buffer {
  const bubbleCount = fields.bubbleCount ?? 1;
  const emptyBubbles = fields.emptyBubbles ?? [];
  const hasTable = fields.hasAuthorityTable !== false;
  const promote = hasTable
    ? promoteSlots(
        bubbleCount,
        emptyBubbles,
        fields.occupiedBubble,
        fields.promoteNone
      )
    : new Set<number>();
  const machine = fields.authorityMachine ?? null;
  const entries = fields.senseEntries ?? [];

  const bw = new BitWriter(32768);
  if (hasTable) {
    bw.writeBit(1);
    for (let i = 0; i < AUTHORITY_SLOTS; i++) {
      bw.writeBit(promote.has(i) ? 1 : 0);
    }
    bw.writeBit(1);
    encodeAuthorityOption(
      bw,
      promote,
      machine,
      fields.promoteSeq ?? DEFAULT_PROMOTE_SEQ
    );
  } else {
    bw.writeBit(0);
  }
  bw.write((fields.activityTime ?? 0) >>> 0, 32);
  if (entries.length > 0) {
    bw.writeBit(1);
    for (const entry of entries) {
      encodeSenseEntry(bw, entry);
    }
  }
  bw.writeBit(0);
  return bw.finish();
}

/** Retail keepalive: `hasAuth=0` + activity time + no sense rows. */
export function buildSensorAuthTickRsat(activityTime = 0): Buffer {
  return buildSensorAuthUpdateRsat({
    activityTime,
    hasAuthorityTable: false,
  });
}

/** Retain earned Action state across applies, including its shared Lifetime. */
export function preserveActionMissionApply(entries: readonly SensorAuthSenseEntry[], retained: readonly SensorAuthSenseEntry[]): SensorAuthSenseEntry[] {
  const key = (e: SensorAuthSenseEntry) => `${e.clientRef.bundle}/${e.clientRef.typeId}/${e.clientRef.typeIndex}`;
  const replaced = new Set(retained.map(key));
  const managed = new Set([1, 3, 4, 5, 29, 32]);
  return [...entries.filter(e => !replaced.has(key(e)) &&
    (e.clientRef.bundle !== 0xf7bd8718 || !managed.has(e.clientRef.typeId))), ...retained];
}

export function buildTowerSensorAuthRsat(opts: {
  activityTime?: number;
  authorityMachine?: Buffer | null;
  playerKey?: bigint;
  scenario?: ScenarioClient;
  slice?: number;
  /** Join grant: hasAuth=1 + Lifetime/Player. Apply: hasAuth=0 + identity/squads/leftovers. */
  grantTable?: boolean;
  promoteSeq?: number;
  /** Omit valid=false vendor sense on same-slice refresh after Phase B. */
  stageTowerVendors?: boolean;
  includeTowerAmbientNpcs?: boolean;
  /** Omit Action Mock Phase A combat rows after its objective is activated. */
  stageActionMockCombat?: boolean;
  actionMissionAuth?: readonly SensorAuthSenseEntry[];
  strikeEngineeringStarted?: boolean;
  /** Actual issued squad identities, retained through same-slice refresh. */
  strikeEngineeringAllocatedSquads?: readonly number[];
  /** Verified native strike_kill_servitors credits; never inferred from roster counts. */
  strikeEngineeringServitorKills?: number;
  strikeEngineeringExitDoorStage?: 'create'|'open'|'delete';
  strikeEngineeringCompleted?: boolean;
  strikeRuinsGuidance?: boolean;
  strikeEngineeringTrashAllocatedSquads?: readonly number[];
  strikeRuinsState?: RuinsRetainedAuth;
  strikeDialogueAuth?: readonly SensorAuthSenseEntry[];
  chapter2DialogueAuth?: readonly SensorAuthSenseEntry[];
  strikeDigSiteState?: {objectiveActive:boolean; occupied:number; owner5Ready:boolean; allocatedSquads:readonly number[]};
  /** Preserve the proven mission prompt through native area apply. */
  venusMissionObjective?: 7 | 14 | 18 | 57 | 60 | 64 | 112 | 120 | 123 | 127;
  venusNorthernDefeatedGates?: readonly number[];
  venusGatekeeperActivated?: boolean;
  venusGateCount?: number;
  venusWarpgateSquads?: readonly number[];
  venusDefeatedGates?: readonly number[];
  /** Actual quest pickups already credited in this activity session. */
  venusFluidCount?: number;
  venusHeadlandsAllocations?: ReadonlyMap<number, number>;
  venusEngineeringAmbientStarted?: boolean;
  venusTransitAmbientStarted?: boolean;
  venusOpeningMinions?: {reinforcements: boolean};
  raidPreviewStarted?: boolean;
}): Buffer {
  const grant = opts.grantTable === true;
  const playerKey = opts.playerKey ?? playerKeyFromCharacter();
  const activityName = opts.scenario?.activityName ?? towerFah.activityName;
  let entries = grant ? buildTowerBinderSenseEntries(playerKey, activityName)
    : buildTowerApplySenseEntries(playerKey,
        opts.slice ?? opts.scenario?.initialBubble ?? towerFah.initialBubble,
        activityName, opts.stageTowerVendors, opts.stageActionMockCombat, opts.includeTowerAmbientNpcs);
  if (!grant && opts.raidPreviewStarted && activityName === 'venus_chapter_2') {
    // Initial placements must never be replayed after a real kill or refresh.
    entries = entries.filter(e => !(e.clientRef.bundle === 0x726e51de &&
      ((e.clientRef.typeId === 1 && [3,4,5,6,7,10].includes(e.clientRef.typeIndex)) ||
       (e.clientRef.typeId === 3 && e.clientRef.typeIndex === 2) ||
       (e.clientRef.typeId === 4 && [0,1].includes(e.clientRef.typeIndex)))));
  }
  if (!grant && activityName === 'action_mock' && opts.actionMissionAuth) {
    entries = preserveActionMissionApply(entries, opts.actionMissionAuth);
  }
  if (!grant && activityName === 'venus_portal_1' && opts.strikeRuinsGuidance) {
    entries = entries.filter(e=>!(e.clientRef.bundle===0x0a302429&&e.clientRef.typeId===32&&e.clientRef.typeIndex===66));
    entries.push(ruinsHud(66,true));
  }
  if (!grant && activityName === 'venus_portal_1') {
    const bindings = buildVenusStrikeBindingEntries(playerKey, opts.slice ?? opts.scenario?.initialBubble ?? 16);
    const key = (entry: SensorAuthSenseEntry) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const replaced = new Set(bindings.map(key));
    entries = [...entries.filter(entry => !replaced.has(key(entry))), ...bindings];
    // Preserve this one object's real Auth lifecycle across same-binding refresh.
    // Never replay default false ObjectAuth or forge a device Sense receipt.
    if ((opts.slice ?? opts.scenario?.initialBubble ?? 16) === 7 && opts.strikeEngineeringExitDoorStage) {
      entries=entries.filter(entry=>!(entry.clientRef.bundle===0x0a302429 &&
        entry.clientRef.typeId===ActivityBundleItemType.Object && entry.clientRef.typeIndex===0));
      entries.push(buildVenusStrikeExitDoorEntry(opts.strikeEngineeringExitDoorStage));
    }
    const opening = buildVenusStrikeEntryObjective();
    if (opts.strikeEngineeringStarted) {
      const allocated = opts.strikeEngineeringAllocatedSquads ?? [2,3];
      if (allocated.some(squad => !Number.isInteger(squad) || !STRIKE_ENGINEERING_SQUAD_PLACEMENTS[squad])) {
        throw new Error('Invalid allocated Engineering squad identity');
      }
      // Preserve native combat lifetime. Never replay initial sense/roster on
      // a registry refresh, which would revive kills or invalidate placement.
      entries = entries.filter(entry => !(entry.clientRef.bundle === 0x0a302429 &&
        ((entry.clientRef.typeId === ActivityBundleItemType.Squad && allocated.includes(entry.clientRef.typeIndex)) ||
         (entry.clientRef.typeId === ActivityBundleItemType.Objective && entry.clientRef.typeIndex === 1) ||
         (entry.clientRef.typeId === ActivityBundleItemType.PlayerObjective && [24,27].includes(entry.clientRef.typeIndex)))));
      entries.push(buildVenusStrikeCombatObjective(24,0),
        buildVenusStrikeCombatObjective(27,opts.strikeEngineeringCompleted ? 0 : 1,opts.strikeEngineeringServitorKills ?? 0));
    } else {
      entries = [...entries.filter(entry => key(entry) !== key(opening)), opening];
    }
  }
  if (!grant && activityName === 'venus_portal_1' && opts.slice === 7 &&
      opts.strikeEngineeringTrashAllocatedSquads?.length) {
    const allocated=opts.strikeEngineeringTrashAllocatedSquads;
    if(allocated.some(n=>!Number.isInteger(n)||n<1||n>4))throw Error('Invalid Engineering trash identity');
    // Actual owner7 native combat state survives same-slice refresh/death.
    // No default roster/Sense or Objective task-state replay.
    entries=entries.filter(e=>!(e.clientRef.bundle===0x97438d09&&
      ((e.clientRef.typeId===ActivityBundleItemType.Squad&&allocated.includes(e.clientRef.typeIndex))||
       (e.clientRef.typeId===ActivityBundleItemType.Objective&&e.clientRef.typeIndex===0))));
  }
  if (!grant && activityName === 'venus_portal_1' && opts.strikeDigSiteState) {
    entries = preserveVenusStrikeDigSiteApply(entries,opts.strikeDigSiteState);
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.slice === 23) {
    const bindings = buildVenusSouthernBindingEntries();
    const key = (entry: SensorAuthSenseEntry) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const replaced = new Set(bindings.map(key));
    entries = [...entries.filter(entry => !replaced.has(key(entry))), ...bindings];
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.slice === 14) {
    const ambient=[120,123,127].includes(opts.venusMissionObjective??-1)?buildVenusNorthernAmbientEntries():[];
    const bindings = [...buildVenusNorthernBindingEntries().filter(e=>!ambient.some(a=>a.clientRef.bundle===e.clientRef.bundle&&a.clientRef.typeId===e.clientRef.typeId&&a.clientRef.typeIndex===e.clientRef.typeIndex)),...ambient];
    const key = (entry: SensorAuthSenseEntry) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const replaced = new Set(bindings.map(key));
    entries = [...entries.filter(entry => !replaced.has(key(entry))), ...bindings];
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.slice === 14 && opts.venusMissionObjective === 120) {
    const active = [buildVenusPlayerObjectiveEntry(123, 0), buildVenusPlayerObjectiveEntry(120, 1),
      ...(opts.venusGatekeeperActivated ? buildVenusGatekeeperActivationEntries() : []),
      ...(opts.venusGatekeeperActivated && process.env.D1A_BOSS_HEALTH_BIND==='1' ? [buildVenusGatekeeperHealthBinding()] : [])];
    const key = (entry: SensorAuthSenseEntry) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const replaced = new Set(active.map(key));
    entries = [...entries.filter(entry => !replaced.has(key(entry))), ...active];
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.slice === 14 &&
      (opts.venusMissionObjective === 123 || opts.venusMissionObjective === 127)) {
    const active = opts.venusMissionObjective === 127 ? [buildVenusPlayerObjectiveEntry(120, 0), buildVenusPlayerObjectiveEntry(127, 1)] : buildVenusNorthernGateEntries(opts.venusNorthernDefeatedGates);
    const key = (entry: SensorAuthSenseEntry) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const replaced = new Set(active.map(key));
    entries = [...entries.filter(entry => !replaced.has(key(entry))), ...active];
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.venusMissionObjective) {
    const objective = opts.venusMissionObjective;
    entries = entries.map(entry => {
      if (objective === 14 && entry.clientRef.bundle === 0xb9d50318 &&
          entry.clientRef.typeId === ActivityBundleItemType.Squad) {
        const allocation = opts.venusHeadlandsAllocations?.get(entry.clientRef.typeIndex);
        if (allocation !== undefined) {
          return buildVenusHeadlandsReplenishmentEntry(entry.clientRef.typeIndex, allocation);
        }
      }
      if (entry.clientRef.bundle !== venusHub.bundle) return entry;
      if (objective === 14 && entry.clientRef.typeId === ActivityBundleItemType.Loot &&
          entry.clientRef.typeIndex === 17) {
        return entryOn(venusHub.bundle, ActivityBundleItemType.Loot, 17,
          encodeLootAuth(true), false);
      }
      if (entry.clientRef.typeId === ActivityBundleItemType.PlayerObjective &&
          entry.clientRef.typeIndex === objective) {
        return objective === 123 ? buildVenusPlayerObjectiveEntry(123, 1, opts.venusNorthernDefeatedGates?.length ?? 0, 2, opts.venusNorthernDefeatedGates) : objective === 14
          ? buildVenusFluidProgressEntry(opts.venusFluidCount ?? 0)
          : buildVenusPlayerObjectiveEntry(objective, 1);
      }
      if (objective === 18 && opts.slice === 10 &&
          entry.clientRef.typeId === ActivityBundleItemType.PlayerTrigger &&
          entry.clientRef.typeIndex === 137) {
        // Native835B86B0: enabled, last-fired(-1) < 0, actual Location322 match.
        const body = encodeExact(bw => PlayerTriggerAuth.encode(bw, { flag: true, unk: 0 }));
        return { ...entry, authBody: body.bytes, authBits: body.bitCount, nativeBodyFraming: true, fullAuthState: true };
      }
      if (objective === 64 && opts.slice === 23 &&
          entry.clientRef.typeId === ActivityBundleItemType.PlayerTrigger &&
          entry.clientRef.typeIndex === 147) {
        const body = encodeExact(bw => PlayerTriggerAuth.encode(bw, { flag: true, unk: 0 }));
        return { ...entry, authBody: body.bytes, authBits: body.bitCount, nativeBodyFraming: true, fullAuthState: true };
      }
      return entry;
    });
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.slice === 23 &&
      (opts.venusMissionObjective === 57 || opts.venusMissionObjective === 60)) {
    const active = opts.venusMissionObjective === 57
      ? buildVenusSouthernInteractionEntries()
      : [...buildVenusSouthernInteractionEntries().filter(entry =>
          entry.clientRef.typeId !== ActivityBundleItemType.PlayerObjective),
         ...buildVenusDeviceCompletionEntries(opts.venusGateCount ?? 0, opts.venusDefeatedGates),
         ...buildVenusSouthernWarpgateWaveEntries(false,row=>(opts.venusWarpgateSquads??[]).includes(row.squad)),
         ...((opts.venusGateCount??0)>=2?buildVenusSouthernSniperEntries():[])];
    const key = (entry: SensorAuthSenseEntry) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
    const replaced = new Set(active.map(key));
    entries = [...entries.filter(entry => !replaced.has(key(entry))), ...active];
  }
  if (!grant && activityName === 'venus_portal_1' && opts.slice === 28 && opts.strikeRuinsState)
    entries=preserveRuinsApply(entries,opts.strikeRuinsState);
  if(!grant&&activityName==='venus_portal_1'&&opts.strikeDialogueAuth?.length) {
    const retained=new Map(opts.strikeDialogueAuth.filter(e=>e.clientRef.bundle===0x0a302429&&e.clientRef.typeId===15)
      .map(e=>[e.clientRef.typeIndex,e]));
    entries=entries.map(e=>e.clientRef.bundle===0x0a302429&&e.clientRef.typeId===15
      ? retained.get(e.clientRef.typeIndex)??e:e);
  }
  if (!grant && activityName === 'venus_chapter_2' && opts.slice === 8 && opts.venusOpeningMinions) {
    entries = preserveVenusOpeningApply(entries, opts.venusOpeningMinions.reinforcements);
    entries = entries.filter(e=>!(e.clientRef.bundle===0x44fb7aa2 &&
      ((e.clientRef.typeId===1 && e.clientRef.typeIndex===1) || (e.clientRef.typeId===3 && e.clientRef.typeIndex===0))));
  }
  if(!grant&&activityName==='venus_portal_1') {
    const triggers=opts.slice===5&&opts.strikeDigSiteState?.owner5Ready?[76,77] as const
      :opts.slice===28&&opts.strikeRuinsState?[83] as const:[];
    entries=entries.map(e=>e.clientRef.bundle===0x0a302429&&e.clientRef.typeId===29&&
      (triggers as readonly number[]).includes(e.clientRef.typeIndex)
      ?strikeDialogueTriggerEntry(e.clientRef.typeIndex as 76|77|83):e);
  }
  if(!grant&&activityName==='venus_chapter_2') {
    const retained=new Map((opts.chapter2DialogueAuth??[]).map(e=>[`${e.clientRef.typeId}/${e.clientRef.typeIndex}`,e]));
    entries=entries.map(e=>{
      if(e.clientRef.bundle!==0x517641f1)return e;
      const saved=retained.get(`${e.clientRef.typeId}/${e.clientRef.typeIndex}`);
      if(saved)return {...e,...saved};
      if(e.clientRef.typeId===5 && e.clientRef.typeIndex in CHAPTER2_DURATIONS) {
        const idle=chapter2SequenceEntry(e.clientRef.typeIndex,0);
        return {...e,authBody:idle.authBody,authBits:idle.authBits};
      }
      return e;
    });
  }
  if(!grant && activityName==='venus_chapter_2' && opts.venusMissionObjective!==undefined) {
    const objective=opts.venusMissionObjective;
    const present=entries.some(e=>e.clientRef.bundle===venusHub.bundle && e.clientRef.typeId===32 && e.clientRef.typeIndex===objective);
    if(!present) entries.push(objective===14 ? buildVenusFluidProgressEntry(opts.venusFluidCount??0)
      : objective===123 ? buildVenusPlayerObjectiveEntry(123,1,opts.venusNorthernDefeatedGates?.length??0,2,opts.venusNorthernDefeatedGates)
      : buildVenusPlayerObjectiveEntry(objective,1));
  }
  if(!grant && activityName==='venus_chapter_2' && opts.venusEngineeringAmbientStarted && opts.slice===7) {
    entries=entries.filter(e=>!(e.clientRef.bundle===0x022112bb &&
      ((e.clientRef.typeId===1 && [33,35,37,39,40,42,44,45].includes(e.clientRef.typeIndex)) ||
       (e.clientRef.typeId===3 && [34,36,38,41,43].includes(e.clientRef.typeIndex)))));
  }
  if(!grant && activityName==='venus_chapter_2' && opts.venusTransitAmbientStarted && opts.slice===21) {
    entries=entries.filter(e=>!(e.clientRef.bundle===0x22859cf8 &&
      ((e.clientRef.typeId===1 && [13,15,17].includes(e.clientRef.typeIndex)) ||
       (e.clientRef.typeId===3 && [14,16,18].includes(e.clientRef.typeIndex)))));
  }
  return buildSensorAuthUpdateRsat({
    activityTime: opts.activityTime,
    authorityMachine: opts.authorityMachine,
    bubbleCount: opts.scenario?.bubbleCount ?? towerClient.bubbleCount,
    emptyBubbles: opts.scenario?.emptyBubbles,
    hasAuthorityTable: grant,
    promoteSeq: opts.promoteSeq,
    senseEntries: entries,
  });
}

/** Host78: Objective79, named Actor81/Squad80 population[0], minion82/83 [2].
 * No additional anonymous boss. Striker/reinforcement timing is still separate.
 * Initial received states are sent once; later refresh must preserve deaths.
 */
/** Producer-only Gatekeeper health binding. Script32 0x152C calls
 * `boss_health.bind_combatant(sq_miniboss__minotaur_mb)`; without it the
 * authored 80/60/40/20 striker thresholds — and with them minotaur_roar, the
 * large gate's mini_spawn channel change and the reinforcement waves — have no
 * producer at all.
 *
 * Native auth initializer 8376A738 writes command sequence 0 and loads -1.0
 * into both floats, so this changes ONLY the ref and requests no health write.
 * BOSS-HEALTH-BINDING.md is explicit that bumping the command counter takes
 * 835BD890's mutation path, which alters the boss rather than observing it —
 * do not "helpfully" increment unk3 here.
 *
 * Kept behind D1A_BOSS_HEALTH_BIND because an unknown leading Health record
 * would otherwise invalidate the existing boss-death parser; the capture has
 * to come first. */
export function buildVenusGatekeeperHealthBinding(): SensorAuthSenseEntry {
  const bundle = 0x517641f1;
  const body = encodeExact((bw) => {
    HealthAuth.encode(bw, {
      ref: { bundle, typeId: ActivityBundleItemType.Actor, typeIndex: 81 },
      unk1: -1,
      unk2: -1,
      unk3: 0,
    });
  });
  return {
    ...entryOn(bundle, ActivityBundleItemType.Health, 152, body, true),
    nativeBodyFraming: true,
  };
}

export function buildVenusGatekeeperActivationEntries(initialPlacement = false): SensorAuthSenseEntry[] {
  const bundle = 0x517641f1;
  const entries = [entryOn(bundle, ActivityBundleItemType.Objective, 79,
    encodeObjectiveActivationAuth(), true, initialPlacement ? encodeObjectiveReceivedState() : undefined)];
  for (const squad of [80, 82, 83]) {
    const population = [squad === 80 ? 0 : 2];
    entries.push(entryOn(bundle, ActivityBundleItemType.Squad, squad,
      encodeSquadAuth(1, population, {group: {bundle, typeId: ActivityBundleItemType.SquadGroup, typeIndex: 350}}),
      true, initialPlacement ? encodeSquadSense(1, true, population) : undefined));
  }
  entries.push(entryOn(bundle, ActivityBundleItemType.Actor, 81,
    encodeExact(bw => ActorAuth.encode(bw, {unk0: 1, unk1: 0, unk2: 0, flag3: true,
      nest4: undefined, nest5: undefined, script: undefined, nest7: undefined})), true));
  return entries.map(entry => ({...entry, nativeBodyFraming: true,
    isSenseUpdateRelative: false, senseStateSequence: 0}));
}

// Host78 utility instances128/130, not decorative large-gate squads90..102.
const NORTHERN_GATE_MARKERS = [
  {actor: 129, position: [799.4000854492188, -104.69996643066406, 25.999996185302734]},
  {actor: 131, position: [791.2999267578125, -73.70003509521484, 25.499996185302734]},
] as const;

export function buildVenusNorthernGateEntries(defeated: readonly number[] = []): SensorAuthSenseEntry[] {
  const gates = NORTHERN_GATE_MARKERS.filter(g => !defeated.includes(g.actor));
  const body = encodeExact(bw => ActorAuth.encode(bw, {unk0: 1, unk1: 0, unk2: 0, flag3: true,
    nest4: undefined, nest5: undefined, script: undefined, nest7: undefined}));
  return [buildVenusPlayerObjectiveEntry(120, 0),
    ...gates.map(g => ({...entryOn(venusHub.bundle, ActivityBundleItemType.Actor, g.actor, body, true),nativeBodyFraming: true})),
    ...(gates.length ? [buildVenusPlayerObjectiveEntry(123, 1, defeated.length, 2, defeated)]
      : [buildVenusPlayerObjectiveEntry(123, 0), buildVenusPlayerObjectiveEntry(120, 1)])];
}


/** Native ActorAuth+8E0/808006AB drop list. Client835B5B68 iterates refs;
 * +924 is the drop sequence compared by835B5724. Generic AA omitted the
 * count-governed vector, so use exact native framing for this command only.
 */
export function encodeVenusPortalDrop(squad: number, sequence: number): FinishedBits {
  if (![104,108].includes(squad) || sequence !== 1) throw new Error('Unverified portal drop');
  return encodeExact(bw => {
    bw.writeBit(0); // preserve actor generation
    bw.write(1,2); bw.write(1,3); bw.writeBit(1); // mode0, policy0, enabled
    bw.writeBit(0); bw.writeBit(0); bw.writeBit(0); // other optional auth absent
    bw.writeBit(1); // field7 present
    bw.write(1,4); // one squad in 808006AA
    SensorClientRef.encode(bw,{bundle:0x517641f1,typeId:ActivityBundleItemType.Squad,typeIndex:squad});
    bw.write(sequence,31);
  });
}

/** Utility62 + native835B3F40/835B5B10: retained scalar channels and a
 * portal-owned squad drop. Four equal float lanes are required by 82BB18E8.
 * This does not send placement sense or change the gate's generation. */
export function buildVenusSouthernPortalEntry(gate:number,version:number,power:number,activate:number,
  drop?:{squad:number;sequence:number}):SensorAuthSenseEntry {
  if(![70,72,74,76,129,131].includes(gate)||!Number.isInteger(version)||version<1||version>0x7fffffff||
     ![0,0.1,0.2,0.4].includes(power)||![0,1].includes(activate)||
     (drop&&(![...VENUS_SOUTHERN_WARPGATE_WAVES,...NORTHERN_PORTAL_WAVES].some(w=>w.gate===gate&&w.squad===drop.squad)||
       !Number.isInteger(drop.sequence)||drop.sequence<1||drop.sequence>0x7fffffff)))throw Error('Invalid Southern portal command');
  const body=encodeExact(bw=>{
    bw.writeBit(1);bw.write(1,31); // stable generation
    bw.write(1,2);bw.write(1,3);bw.writeBit(1);
    bw.writeBit(1); // channels, native808006A7
    bw.write(version,31);bw.write(0,2);bw.write(0,3);
    SensorClientRef.encode(bw,UNSET_CLIENT_REF);bw.write(1,32); // biased f4=0
    bw.write(2,3);
    for(const [hash,value] of [[0x175b82aa,power],[0xf85655be,activate]]){
      bw.write(hash,32);const f=Buffer.alloc(4);f.writeFloatBE(value);
      for(let lane=0;lane<4;lane++)bw.write(f.readUInt32BE(),32);
    }
    bw.writeBit(0);bw.writeBit(0); // other optional auth absent
    bw.writeBit(!!drop);
    if(drop){bw.write(1,4);SensorClientRef.encode(bw,{bundle:venusHub.bundle,typeId:1,typeIndex:drop.squad});bw.write(drop.sequence,31);}
  });
  return {...entryOn(venusHub.bundle,ActivityBundleItemType.Actor,gate,body,true),nativeBodyFraming:true};
}

export function buildVenusPortalOpeningDrop(gate: number): SensorAuthSenseEntry[] {
  if (gate !== 129 && gate !== 131) throw new Error('Not a Northern utility gate');
  const squad = gate === 129 ? 104 : 108;
  const population = gate === 129 ? [2,1] : [2];
  const group = gate === 129 ? 352 : 353;
  return [
    entryOn(venusHub.bundle,ActivityBundleItemType.Objective,79,encodeObjectiveActivationAuth(),true,encodeObjectiveReceivedState()),
    // Allocate authored population; no Squad.place sense or pre-spawned units.
    entryOn(venusHub.bundle,ActivityBundleItemType.Squad,squad,encodeSquadAuth(population.length,population,
      {group:{bundle:venusHub.bundle,typeId:ActivityBundleItemType.SquadGroup,typeIndex:group}}),true),
    entryOn(venusHub.bundle,ActivityBundleItemType.Actor,gate,encodeVenusPortalDrop(squad,1),true),
  ].map(entry=>({...entry,nativeBodyFraming:true}));
}


/** Isolated native filterless-task activation experiment. Only native client
 * slots are accepted; the group-filtered leaves do not admit group165.
 */
export function buildVenusStrikeEngineeringTask(slot: 4 | 5, initial = true): SensorAuthSenseEntry {
  if (slot !== 4 && slot !== 5) throw new Error('Not a filterless Engineering task');
  const body = encodeExact(bw => ObjectiveSense.encode(bw, {
    table: {values:Array.from({length:24}, (_, i) => i < 6 ? (i === slot ? 1 : 0) : undefined)},
    unk1:undefined,
  }));
  return {...entryOn(0x0a302429, ActivityBundleItemType.Objective, 1, body, true,
    initial ? encodeObjectiveReceivedState() : undefined), nativeBodyFraming:true,
    isSenseUpdateRelative:false, senseStateSequence:0};
}

/** Authored HUD objective identities. No completion credit or synthetic kills. */
export function buildVenusStrikeCombatObjective(index: 24 | 27, state: 0 | 1, current = 0): SensorAuthSenseEntry {
  if ((index !== 24 && index !== 27) || (state !== 0 && state !== 1)
      || !Number.isInteger(current) || current < 0 || current > 4 || (index === 24 && current !== 0)) {
    throw new Error('Invalid native Engineering objective progress');
  }
  const body = encodeExact(bw => PlayerObjectiveAuth.encode(bw, {
    unk0:state, ref1:UNSET_CLIENT_REF, flag2:false, options:emptyActivityOptions(),
    unk4:index === 27 ? 1 : 0, unk5:current, unk6:index === 27 ? 4 : 0,
    ref7:UNSET_CLIENT_REF, slots:{slots:Array.from({length:10}, (_, slot) => ({
      unk0:index === 27 && state === 1 && slot === 0 ? 1 : 0,
      ref:index === 27 && state === 1 && slot === 0
        ? {bundle:0x0a302429,typeId:ActivityBundleItemType.NavPoint,typeIndex:153} : UNSET_CLIENT_REF,
      // Packaged Nav153: client2292_808004c5+260. Marker only, never a spawn target.
      kind13:index === 27 && state === 1 && slot === 0
        ? Buffer.from('c36325ffc39912ad4225fbba','hex') : Buffer.alloc(12),unk3:0,unk4:0,
    }))},unk9:0,unk10:0,
  }));
  return {...entryOn(0x0a302429,ActivityBundleItemType.PlayerObjective,index,body,false),nativeBodyFraming:true};
}

/** Bounded initial2/3 experiment. Native835ABD38: ref0 is Objective, unk5
 * is assignment cookie, unk8 is zero-based client task. Host task5/client4
 * is the authored wildcard hypothesis; no firing-area or position override.
 * Keep cookie1 across refills: it is NOT the squad epoch cookie (unk4).
 */
export function buildVenusStrikeInitialObjectiveAssignment(
  squad: 2 | 3, cumulativePopulation?: readonly number[],
): SensorAuthSenseEntry {
  if (squad !== 2 && squad !== 3) throw new Error('Only initial Engineering squads are authorized for this experiment');
  const entry = buildVenusStrikeEngineeringSquadEntry(squad,cumulativePopulation);
  const auth = encodeExact(bw => SquadAuth.encode(bw, {
    ref0:{bundle:0x0a302429,typeId:ActivityBundleItemType.Objective,typeIndex:1},
    ref1:undefined,filter:undefined,
    roster:{slots:[...(cumulativePopulation ?? [3,3])]},
    unk4:undefined, // Native epoch: do not change/reset the squad.
    unk5:1, // Assignment cookie +4C; fresh run starts at0.
    unk6:undefined,unk7:undefined,
    unk8:4, // Auth+58 -> squad+33C, task iterator zero-based index4.
    unk9:0,unk10:0,
  }));
  return {...entry,authBody:auth.bytes,authBits:auth.bitCount};
}

/** Explicit authored group filters plus r426-proven initial task4.
 * Corner167/172 use task4 ONLY as a bounded wildcard-placement hypothesis;
 * their exact authored task association remains unverified.
 */
const STRIKE_BOUNDED_TASK_BY_SQUAD: Readonly<Record<number,number>> = {
  2:4,3:4,10:3,11:3,12:1,19:1,4:2,5:2,6:0,16:0,
  7:4,8:4,9:4,17:4,18:4, // r428 wildcard-placement hypothesis, not recovered authored mapping.
};

/** Actual authored respawn only: enroll the squad in its native Objective/task.
 * Preserve Objective task-f0 state; enrollment uses SquadAuth.ref0/+4C/+58.
 * No epoch reset, firing-area override, extra wave or kill credit.
 */
export function buildVenusStrikeObjectiveAssignedSquadEntry(
  squad:number, cumulativePopulation?:readonly number[],
): SensorAuthSenseEntry {
  if (!Number.isInteger(squad) || !Object.hasOwn(STRIKE_BOUNDED_TASK_BY_SQUAD,squad)) {
    throw new Error('Engineering task mapping not accepted for this squad; do not substitute a group ref');
  }
  const task=STRIKE_BOUNDED_TASK_BY_SQUAD[squad];
  const placement=STRIKE_ENGINEERING_SQUAD_PLACEMENTS[squad];
  const entry=buildVenusStrikeEngineeringSquadEntry(squad,cumulativePopulation);
  const auth=encodeExact(bw => SquadAuth.encode(bw, {
    ref0:{bundle:0x0a302429,typeId:ActivityBundleItemType.Objective,typeIndex:1},
    ref1:undefined,filter:undefined,
    roster:{slots:[...(cumulativePopulation ?? placement.population)]},
    unk4:undefined,unk5:1,unk6:undefined,unk7:undefined,unk8:task,unk9:0,unk10:0,
  }));
  return {...entry,authBody:auth.bytes,authBits:auth.bitCount};
}

/** Authored global Object0 only. Position command and traversal need runtime proof. */
export function buildVenusStrikeExitDoorEntry(stage: 'create' | 'open' | 'delete'): SensorAuthSenseEntry {
  const body = encodeExact(bw => {
    bw.write(0x80000001, 32); // Object lifetime1, signed32 bias. Retain across opening/deletion.
    bw.writeBit(stage === 'delete' ? 0 : 1);
    SensorClientRef.encode(bw, UNSET_CLIENT_REF);
    bw.write(stage === 'open' ? 1 : 0, 4);
    if (stage === 'open') {
      bw.writeBit(1); bw.write(0x80802d88, 32); // native kind33 header
      bw.write(0x80000000, 32); bw.write(0, 32); // powerVersion0: no new power command
      bw.write(0x80000000, 32); bw.write(0, 32); // lockVersion0: no new lock command
      bw.write(0x80000001, 32); bw.write(0x3f800000, 32); // positionVersion1,target1.0
    }
  });
  // Auth body only, preserve the already-bound native Sense schema; no Sense body/receipt.
  return { ...entryOn(0x0a302429, ActivityBundleItemType.Object, 0, body, true),
    nativeBodyFraming: true };
}

// ANALYSIS ONLY: append these scoped helpers to sensor-auth.ts after review.
const DIG_SITE_PLACEMENTS:Readonly<Record<number,{population:readonly number[];task:number}>>={
  1:{population:[2],task:6},2:{population:[3],task:6},3:{population:[4],task:6}, // UNVERIFIED first-wildcard hypothesis.
  4:{population:[2],task:4},5:{population:[1],task:3},6:{population:[1],task:3},7:{population:[1],task:3},
  8:{population:[2],task:5},9:{population:[6],task:2},10:{population:[1,3],task:0},
  11:{population:[4],task:1},12:{population:[4],task:1},
};
/** One actual authored place(), once per binding. Refresh must retain this state. */
export function buildVenusStrikeDigSiteSquadEntry(squad:number):SensorAuthSenseEntry {
  if(!Number.isInteger(squad)||!Object.hasOwn(DIG_SITE_PLACEMENTS,squad))throw Error('Unknown Dig Site squad');
  const placement=DIG_SITE_PLACEMENTS[squad];
  const template=strikeSquads.find(row=>row.bundle==='5DE7D8E2'&&row.squad===squad);
  if(!template||template.memberCount!==placement.population.length)throw Error('Dig Site native member mismatch');
  const body=encodeExact(bw=>SquadAuth.encode(bw,{
    ref0:{bundle:0x5de7d8e2,typeId:ActivityBundleItemType.Objective,typeIndex:0},
    ref1:undefined,filter:undefined,roster:{slots:[...placement.population]},
    unk4:undefined,unk5:1,unk6:undefined,unk7:undefined,unk8:placement.task,unk9:0,unk10:0,
  }));
  return {...entryOn(0x5de7d8e2,ActivityBundleItemType.Squad,squad,body,true,
    encodeSquadSense(template.memberCount,true,placement.population)),nativeBodyFraming:true,
    isSenseUpdateRelative:false,senseStateSequence:0};
}
export function buildVenusStrikeDigSiteTrigger(bundle:number,index:number):SensorAuthSenseEntry {
  if(!((bundle===0x5de7d8e2&&(index===41||index===42))||(bundle===0x0a302429&&index===75)))
    throw Error('Not an authored Dig Site trigger');
  return {...entryOn(bundle,ActivityBundleItemType.PlayerTrigger,index,
    encodeExact(bw=>PlayerTriggerAuth.encode(bw,{flag:true,unk:0})),false),nativeBodyFraming:true};
}
/** Native arrival30 binds Nav179 through trigger_volume_objective script82. */
export function buildVenusStrikeDigSiteObjective(active:boolean):SensorAuthSenseEntry {
  const body=encodeExact(bw=>PlayerObjectiveAuth.encode(bw,{
    unk0:active?1:0,ref1:UNSET_CLIENT_REF,flag2:false,options:emptyActivityOptions(),
    unk4:0,unk5:0,unk6:0,ref7:UNSET_CLIENT_REF,
    slots:{slots:Array.from({length:10},(_,slot)=>({
      unk0:active&&slot===0?1:0,
      ref:active&&slot===0?{bundle:0x0a302429,typeId:ActivityBundleItemType.NavPoint,typeIndex:179}:UNSET_CLIENT_REF,
      // Script82 objective_begin_immediate activates its bound _nav_point179.
      // Exact client2292+280 XYZ; HUD target only, never spawn/teleport coordinates.
      kind13:active&&slot===0?Buffer.from('c30059eac32a95a241b8191b','hex'):Buffer.alloc(12),unk3:0,unk4:0,
    }))},
    unk9:0,unk10:0,
  }));
  return {...entryOn(0x0a302429,ActivityBundleItemType.PlayerObjective,30,body,false),nativeBodyFraming:true};
}
/** Apply AFTER the generic portal registry merge. No roster/Sense replay. */
export function preserveVenusStrikeDigSiteApply(entries:SensorAuthSenseEntry[],state:{
  objectiveActive:boolean; occupied:number; owner5Ready:boolean; allocatedSquads:readonly number[];
}):SensorAuthSenseEntry[] {
  if(state.allocatedSquads.some(n=>!Object.hasOwn(DIG_SITE_PLACEMENTS,n)))throw Error('Unknown retained Dig Site squad');
  const ready=state.occupied===5&&state.owner5Ready;
  const retained=new Set(state.allocatedSquads);
  const result=entries.filter(entry=>{
    const r=entry.clientRef;
    if(ready&&r.bundle===0x0a302429&&r.typeId===ActivityBundleItemType.PlayerObjective&&r.typeIndex===30)return false;
    if(!ready)return true;
    if(r.bundle===0x5de7d8e2&&((r.typeId===ActivityBundleItemType.Squad&&retained.has(r.typeIndex))||
       (r.typeId===ActivityBundleItemType.Objective&&r.typeIndex===0)||
       (r.typeId===ActivityBundleItemType.PlayerTrigger&&[41,42].includes(r.typeIndex))))return false;
    return !(r.bundle===0x0a302429&&r.typeId===ActivityBundleItemType.PlayerTrigger&&r.typeIndex===75);
  });
  if(ready)result.push(buildVenusStrikeDigSiteObjective(state.objectiveActive));
  if(ready)result.push(buildVenusStrikeDigSiteTrigger(0x5de7d8e2,41),
    buildVenusStrikeDigSiteTrigger(0x5de7d8e2,42),buildVenusStrikeDigSiteTrigger(0x0a302429,75));
  return result;
}

/** Private script26 deferred8. Squad1 task0 exact;2/task1 and3/4/task2 are
 * explicitly a native authored-elevation hypothesis (FA61 lower, FA62 upper).
 * One initial Auth/Sense only; caller preserves it across same-owner refresh.
 */
export function buildVenusStrikeEngineeringTrashSquadEntry(squad:number):SensorAuthSenseEntry {
  const rows:Readonly<Record<number,{population:number;task:number}>>={
    1:{population:3,task:0},2:{population:3,task:1},3:{population:1,task:2},4:{population:1,task:2}};
  if(!Number.isInteger(squad)||!Object.hasOwn(rows,squad))throw Error('Unknown Engineering trash squad');
  const row=rows[squad],template=strikeSquads.find(s=>s.bundle==='97438D09'&&s.squad===squad);
  if(!template||template.memberCount!==1)throw Error('Engineering trash template mismatch');
  const body=encodeExact(bw=>SquadAuth.encode(bw,{
    ref0:{bundle:0x97438d09,typeId:ActivityBundleItemType.Objective,typeIndex:0},
    ref1:undefined,filter:undefined,roster:{slots:[row.population]},
    unk4:undefined,unk5:1,unk6:undefined,unk7:undefined,unk8:row.task,unk9:0,unk10:0,
  }));
  return {...entryOn(0x97438d09,ActivityBundleItemType.Squad,squad,body,true,
    encodeSquadSense(1,true,[row.population])),nativeBodyFraming:true,isSenseUpdateRelative:false,senseStateSequence:0};
}

/** Native owner7 shared ambient encounters, host177 populations. Once per
 * activity visit; later refresh omits their defaults to preserve real deaths.
 * No strike encounters, mission rewards or kill receipts are synthesized. */
export function buildVenusEngineeringAmbientEntries():SensorAuthSenseEntry[] {
  const bundle=0x022112bb;
  const populations:ReadonlyArray<readonly [number,readonly number[]]>=[
    [33,[3,1]],[35,[3,1]],[37,[3,2]],[39,[3,1]],[40,[3,1]],[42,[5,1]],[44,[3,1]],[45,[3,1]]];
  const entries=[...[34,36,38,41,43].map(index=>entryOn(bundle,ActivityBundleItemType.Objective,index,
    encodeObjectiveActivationAuth(),true,encodeObjectiveReceivedState())),
    ...populations.map(([index,population])=>entryOn(bundle,ActivityBundleItemType.Squad,index,
      encodeSquadAuth(2,population),true,encodeSquadSense(2,true,population)))];
  for(const entry of entries){entry.nativeBodyFraming=true;entry.isSenseUpdateRelative=false;entry.senseStateSequence=0;}
  return entries;
}

/** Shattered Coast on-foot route: host185 simple_hospital01/02 and
 * simple_headlands populations; fixed two-category native templates.
 * Dropship encounters require their own controller and are excluded here. */
export function buildVenusTransitAmbientEntries():SensorAuthSenseEntry[] {
  const bundle=0x22859cf8;
  const entries=[...[14,16,18].map(i=>entryOn(bundle,ActivityBundleItemType.Objective,i,
    encodeObjectiveActivationAuth(),true,encodeObjectiveReceivedState())),
    ...([[13,[2,3]],[15,[3,2]],[17,[3,2]]] as const).map(([i,population])=>{
      const native=venusSquadCounts.find(r=>r.bundle==='22859CF8'&&r.squad===i);
      if(native?.memberCount!==population.length)throw Error('Transit native roster mismatch');
      return entryOn(bundle,ActivityBundleItemType.Squad,i,encodeSquadAuth(2,population),true,
        encodeSquadSense(2,true,population));
    })];
  // One-time complete authored snapshots must initialize newly bound sensors.
  // Relative Auth can decode into scratch instead of installing the roster.
  for(const e of entries){e.nativeBodyFraming=true;e.fullAuthState=true;e.isSenseUpdateRelative=false;e.senseStateSequence=0;}
  return entries;
}

/** Authored Chapter2 end-gate device; preserve its bound Sense and lifetime. */
export function buildChapter2EndGate(open=false):SensorAuthSenseEntry {
  const template=buildVenusStrikeExitDoorEntry(open?'open':'create');
  return {...template,clientRef:{bundle:0x517641f1,typeId:4,typeIndex:77}};
}
export function buildChapter2EndMonitor():SensorAuthSenseEntry {
  return {...entryOn(0x517641f1,ActivityBundleItemType.PlayerMonitor,154,encodePlayerMonitorAuth(),true),nativeBodyFraming:true};
}

/** Native host00DC/189: six anonymous combat squads, exact 4/4/1/1/1/3
 * populations, Objective2 ref at +38. Their packaged templates own positions.
 * This is one entrance wave for exploration; it does not implement raid victory. */
export function buildRaidEntranceEntries(): SensorAuthSenseEntry[] {
  const bundle = 0x726e51de;
  const entries = [entryOn(bundle,ActivityBundleItemType.Objective,2,
    encodeObjectiveActivationAuth(),true,encodeObjectiveReceivedState())];
  for (const [squad,population] of [[3,4],[4,4],[5,1],[6,1],[7,1],[10,3]]) {
    const native = venusSquadCounts.find(r => r.bundle === '726E51DE' && r.squad === squad);
    if (native?.memberCount !== 1 || native.owner !== 29) throw Error('Raid native template mismatch');
    entries.push(entryOn(bundle,ActivityBundleItemType.Squad,squad,
      encodeSquadAuth(1,[population],{firingAreaSet:{bundle,typeId:ActivityBundleItemType.Objective,typeIndex:2}}),
      true,encodeSquadSense(1,true,[population])));
  }
  return entries.map(e => ({...e,nativeBodyFraming:true,fullAuthState:true,
    isSenseUpdateRelative:false,senseStateSequence:0}));
}
export function buildRaidEntranceObject(index:0|1,open=false):SensorAuthSenseEntry {
  if (open && index !== 0) throw Error('Only the native raid gate receives a device command');
  return {...buildVenusStrikeExitDoorEntry(open?'open':'create'),
    clientRef:{bundle:0x726e51de,typeId:ActivityBundleItemType.Object,typeIndex:index}};
}
