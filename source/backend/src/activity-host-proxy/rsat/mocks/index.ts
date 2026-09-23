import { BitReader, BitWriter, decode, encode } from "@blamnetwork/rsat";
import type { AhClientIdentity } from "../../join";
import {
  MEMBERSHIP_SLOT_COUNT,
  PAH_PEER_SLOT_COUNT,
  PAH_REGION_COUNT,
  ReplicateMembership,
} from "../schemas/membership";
import {
  BUBBLE_SLOTS,
  GlobalActivityState,
  WorldGlobalsState,
} from "../schemas/messages";

/**
 * Instantiation (ENUM 27) needs valid=1 and draining=0. Activity / slice
 * ids stay 0 until we read them off the client's start request.
 */

export interface GlobalActivityStateFields {
  activityChecksum?: number;
  activityId?: number;
  activityName?: string;
  bubbleCount?: number;
  emptyBubbles?: readonly number[];
  familyChecksum?: number;
  initialBubble?: number;
  initialState?: number;
  instanceId: bigint;
}

/** Client TOD init denominator. worldServerTime / this = day fraction. */
export const GAS_SECONDS_PER_DAY = 3600;
/** 10:00. 0 is midnight. */
export const GAS_TIME_OF_DAY_FRACTION = 10 / 24;

/** see sub_83619DD0 */
export function packBubbleStateHandle(bubble: number, state = 0): number {
  return ((bubble & 0b0011_1111) << 3) | (state & 0b0000_0111);
}

export function unpackBubbleStateHandle(handle: number): {
  bubble: number;
  state: number;
} {
  return {
    bubble: (handle >>> 3) & 0b0011_1111,
    state: handle & 0b0000_0111,
  };
}

/**
 * Class-17 refresh is 8 bytes. The first dword carries the early lifecycle
 * value. On the proven final transitions (3 initial, 5 teleport), the high-bit-tagged
 * second dword carries the destination bubble.
 */
export function parseStateRefreshSlice(
  payload: Buffer,
  bubbleCount: number
): number | undefined {
  if (payload.length < 4 || payload.every((byte) => byte === 0)) {
    return;
  }

  const word = payload.readUInt32BE(0);
  // Native teleport refresh has a lifecycle counter followed by a destination.
  // 7fffffff is unset: r406 full-chain capture emitted counter11 here, while
  // client-auth still requested Southern destination184. Never use that
  // counter as a bubble. Preserve the separately observed bootstrap0/2 path.
  if (word >= 3 && payload.length === 8 &&
      payload.readUInt32BE(4) === 0x7fff_ffff) {
    return;
  }
  if (word >= 3 && payload.length >= 8) {
    const destination = payload.readUInt32BE(4);
    if ((destination & 0x8000_0000) !== 0) {
      const bubble = destination & 0x7fff_ffff;
      return bubble < bubbleCount ? bubble : undefined;
    }
  }

  if (word < bubbleCount) {
    return word;
  }
  if (word >>> 9) {
    return;
  }
  const { bubble } = unpackBubbleStateHandle(word);
  return bubble < bubbleCount ? bubble : undefined;
}

function activityNameChars(name: string | undefined): number[] {
  const chars = new Array(256).fill(0);
  if (!name) {
    return chars;
  }
  for (let i = 0; i < name.length && i < 256; i++) {
    chars[i] = name.charCodeAt(i);
  }
  return chars;
}

export function buildGlobalActivityStateRsat(
  fields: bigint | GlobalActivityStateFields
): Buffer {
  const input = typeof fields === "bigint" ? { instanceId: fields } : fields;
  const bubbleCount = input.bubbleCount ?? 1;
  const empty = new Set(input.emptyBubbles ?? []);
  const states = Array.from({ length: BUBBLE_SLOTS }, (_, i) =>
    i < bubbleCount && !empty.has(i) ? 0 : -1
  );
  return encode(GlobalActivityState, {
    valid: true,
    scenario: true,
    draining: false,
    instanceId: input.instanceId,
    bubbleCount,
    bubbleStates: { states },
    initialSlice: packBubbleStateHandle(
      input.initialBubble ?? 0,
      input.initialState ?? 0
    ),
    familyChecksum: input.familyChecksum ?? 0,
    activityChecksum: input.activityChecksum ?? 0,
    world: {
      valid: true,
      handles: { handles: [] },
      unk2: 0,
      worldServerTime: BigInt(
        Math.floor(GAS_TIME_OF_DAY_FRACTION * GAS_SECONDS_PER_DAY)
      ),
      activityId: input.activityId ?? 0,
      activityName: { chars: activityNameChars(input.activityName) },
    },
  });
}

export function buildWorldGlobalsStateRsat(): Buffer {
  return encode(WorldGlobalsState, {
    valid: true,
    tickDurationMs: 1000 / 30,
  });
}

export function parseGlobalActivityState(payload: Buffer) {
  return decode(GlobalActivityState, payload);
}

/** 808044C1+1: assign — required before matchmaking-GS is enqueued. */
const PAH_AMBASSADOR_ASSIGN = 1;

export interface ReplicateMembershipFields {
  /** Keep Chapter 2's compatibility rows across natural region handoffs. */
  preserveRegionTokenRows?: boolean;
  /** Native transition token per requested region (8293B4BC..8293B4C8). */
  regionTokens?: Readonly<Record<number, number>>;
  /** Native 808044D2 request, consumed by 829EBB90 -> 82931788. */
  teleportRequest?: {
    completed?: boolean;
    cookie: number;
    destination: number;
    insertionHash: number;
    deinstantiateMask: number;
  };
  anchorBubble?: number;
  bubbleCount?: number;
  emptyBubbles?: readonly number[];
  generation?: number;
  initialBubble?: number;
  initialState?: number;
}

function emptyPahRow(regionId = -1) {
  return {
    regionId,
    unk1: 0,
    ambassador: {
      revokeToken: 0,
      opcode: 0,
      slot: 0,
      flag: false,
    },
    peerMask: 0,
    public: {
      unk0: 0,
      sessionLock: 0,
      peerSlots: { markers: Buffer.alloc(PAH_PEER_SLOT_COUNT) },
      advertised: {
        session: { bytes: Buffer.alloc(8) },
        pad: { bytes: Buffer.alloc(36) },
        activityHost: { bytes: Buffer.alloc(16) },
      },
      activityHostId: 0n,
    },
  };
}

function emptyUnknown808044CC() {
  return { a: 0, b: 0, c: 0, d: 0 };
}

/**
 * 40 region rows. Unused slots are region_id=-1 so the transition manager
 * does not walk zeros as forty copies of region 0.
 */
function buildPahRegions(
  bubbleCount: number,
  initialBubble: number,
  initialState: number,
  emptyBubbles: readonly number[] = [],
  anchorBubble?: number,
  regionTokens: Readonly<Record<number, number>> = {},
  preserveRegionTokenRows = false
) {
  const empty = new Set(emptyBubbles);
  const rows = Array.from({ length: PAH_REGION_COUNT }, () => emptyPahRow());
  const bubbles = Array.from({ length: bubbleCount }, (_, bubble) => bubble).filter(
    (bubble) => !empty.has(bubble)
  );
  if (preserveRegionTokenRows) {
    const priority = [initialBubble, anchorBubble].filter(
      (bubble, index, values): bubble is number => bubble !== undefined &&
        bubbles.includes(bubble) && values.indexOf(bubble) === index
    );
    const ordered = [...priority, ...bubbles.filter(bubble => !priority.includes(bubble))];
    const inserted = new Set<string>();
    let i = 0;
    const add = (bubble: number, token: number): void => {
      const key = `${bubble}:${token}`;
      if (inserted.has(key) || i >= PAH_REGION_COUNT) return;
      inserted.add(key);
      const row = emptyPahRow(packBubbleStateHandle(bubble, initialState));
      row.peerMask = 1;
      row.public.peerSlots.markers[0] = token;
      // 8293B4BC checks this marker before consuming the assignment.
      if (bubble === initialBubble && token === (regionTokens[bubble] ?? 1)) {
        row.ambassador.opcode = PAH_AMBASSADOR_ASSIGN;
      }
      rows[i++] = row;
    };
    // Reserve every active area before spending extra rows on local tokens.
    // The old transition path collapsed an area's eight rows to one whenever
    // a request token was learned. Preserve the working compatibility range.
    for (const bubble of ordered) add(bubble, regionTokens[bubble] ?? 1);
    for (const bubble of ordered) {
      for (let token = 1; token <= 8; token++) add(bubble, token);
    }
    return { table: { rows }, unknown0: { a: 0, b: 0, c: 0 },
      unknown1: { a: 0, left: emptyUnknown808044CC(), right: emptyUnknown808044CC() } };
  }
  if (bubbles.length * 8 > PAH_REGION_COUNT) {
    const priority = [initialBubble, anchorBubble].filter(
      (bubble, index, values): bubble is number =>
        bubble !== undefined && values.indexOf(bubble) === index
    );
    let i = 0;
    const addRow = (bubble: number, token: number): void => {
      if (regionTokens[bubble] !== undefined && token !== 1) return;
      if (i >= PAH_REGION_COUNT) {
        return;
      }
      const row = emptyPahRow(packBubbleStateHandle(bubble, initialState));
      row.peerMask = 1;
      row.public.peerSlots.markers[0] = regionTokens[bubble] ?? token;
      if (bubble === initialBubble && token === 1) {
        row.ambassador.opcode = PAH_AMBASSADOR_ASSIGN;
      }
      rows[i++] = row;
    };
    const remaining = bubbles.filter((bubble) => !priority.includes(bubble));
    // Preserve complete local/entrance permissions, then represent every
    // other GAS-active bubble once instead of spending all 40 rows on five.
    for (const bubble of priority) {
      for (let token = 1; token <= 8; token++) {
        addRow(bubble, token);
      }
    }
    for (const bubble of remaining) {
      addRow(bubble, 1);
    }
    for (const bubble of remaining) {
      for (let token = 2; token <= 8; token++) {
        addRow(bubble, token);
      }
    }
    return {
      table: { rows },
      unknown0: { a: 0, b: 0, c: 0 },
      unknown1: {
        a: 0,
        left: emptyUnknown808044CC(),
        right: emptyUnknown808044CC(),
      },
    };
  }
  let i = 0;
  for (const bubble of bubbles) {
    for (let token = 1; token <= 8 && i < PAH_REGION_COUNT; token++) {
      if (regionTokens[bubble] !== undefined && token !== 1) continue;
      const row = emptyPahRow(packBubbleStateHandle(bubble, initialState));
      row.peerMask = 1;
      row.public.peerSlots.markers[0] = regionTokens[bubble] ?? token;
      if (bubble === initialBubble && token === 1) {
        row.ambassador.opcode = PAH_AMBASSADOR_ASSIGN;
      }
      rows[i++] = row;
    }
    if (i >= PAH_REGION_COUNT) {
      break;
    }
  }
  return {
    table: { rows },
    unknown0: { a: 0, b: 0, c: 0 },
    unknown1: {
      a: 0,
      left: emptyUnknown808044CC(),
      right: emptyUnknown808044CC(),
    },
  };
}

/**
 * AH class 11 Option<808044E0>.
 * Presence bit is required see sub_836907E8
 */
export function buildReplicateMembershipRsat(
  identity: AhClientIdentity,
  fields: number | ReplicateMembershipFields = 1
): Buffer {
  if (identity.machine.length !== 6) {
    throw new Error(
      `membership machine id must be 6 bytes, got ${identity.machine.length}`
    );
  }
  if (identity.player.length !== 8) {
    throw new Error(
      `membership player id must be 8 bytes, got ${identity.player.length}`
    );
  }

  const opts = typeof fields === "number" ? { generation: fields } : fields;
  const generation = (opts.generation ?? 1) >>> 0;
  const bubbleCount = Math.max(1, opts.bubbleCount ?? 1);
  const initialBubble = opts.initialBubble ?? 0;
  const initialState = opts.initialState ?? 0;

  const emptySlot = { identity: undefined, auth: undefined };
  const slots = Array.from({ length: MEMBERSHIP_SLOT_COUNT }, (_, i) =>
    i === 0 ? { identity, auth: undefined } : emptySlot
  );

  const bw = new BitWriter();
  bw.writeBit(1);
  const pahRegions = buildPahRegions(
    bubbleCount, initialBubble, initialState, opts.emptyBubbles, opts.anchorBubble, opts.regionTokens,
    opts.preserveRegionTokenRows
  );
  if (opts.teleportRequest) {
    const request = opts.teleportRequest;
    // +14 cookie changes are accepted independently of +00 host state.
    // 829EBDA0 forwards +18 destination, +1C insertion hash, +20 mask.
    // Native reset 8293126C uses insertion hash811C9DC5 and mask0.
    pahRegions.unknown1 = {
      a: request.completed ? 0 : 1,
      left: request.completed ? {
        a: request.cookie, b: request.destination,
        c: request.insertionHash, d: request.deinstantiateMask,
      } : emptyUnknown808044CC(),
      right: {
        a: request.cookie,
        b: request.destination,
        c: request.insertionHash,
        d: request.deinstantiateMask,
      },
    };
  }
  ReplicateMembership.encode(bw, {
    generation,
    unk: generation,
    clients: { slots },
    pahRegions,
    occupiedMask: 1,
    machineMask: 1,
    unkMask: undefined,
    replicateMask: 0,
  });
  return bw.finish();
}

export function parseReplicateMembership(payload: Buffer) {
  const br = new BitReader(payload);
  if (!br.readBit()) {
    return null;
  }
  return ReplicateMembership.decode(br);
}

export type {
  FinishedBits,
  SensorAuthSenseEntry,
  SensorAuthUpdateFields,
  SensorClientRefFields,
} from "./sensor-auth";
export {
  buildActionMockObjectiveActivationSenseEntries,
  buildActionMockSquadActivationSenseEntries,
  buildSensorAuthTickRsat,
  buildSensorAuthUpdateRsat,
  buildTowerApplySenseEntries,
  buildTowerBinderSenseEntries,
  buildTowerLeftoverSenseEntries,
  buildTowerPostmasterActivationSenseEntries,
  buildTowerVendorActivationSenseEntries,
  buildTowerSensorAuthRsat,
  buildVenusVexActivationSenseEntries,
  buildVenusVexObjectiveActivationSenseEntries,
  buildVenusVexPlayerMonitorReceivedSenseEntries,
  buildVenusVexSquadActivationSenseEntries,
  playerKeyFromCharacter,
} from "./sensor-auth";
