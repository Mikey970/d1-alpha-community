import {characterSetting} from '../../character-context';
import {existsSync, readFileSync, renameSync, writeFileSync} from "node:fs";

const POLICY = "captured-native-hold-x-v1";
const MAX_TOMBSTONES = 512;
const DISMANTLABLE_BUCKETS = new Set([3, 4, 5, 8, 9, 10, 11, 12]);

type DismantleItem = {
  soid: bigint;
  defIndex: number;
  bucket: number;
  slot: number;
};

type Tombstone = {
  soid: string;
  defIndex: number;
  actionIndex: number;
  removedAt: string;
};

type Journal = {
  schema: 1;
  policy: typeof POLICY;
  version: number;
  tombstones: Tombstone[];
};

export type DismantleResult = {
  accepted: boolean;
  changed: boolean;
  reason: string;
};

const path = () => characterSetting('D1A_EQUIPMENT_PROFILE')
  ? `${characterSetting('D1A_EQUIPMENT_PROFILE')}.dismantle.json`
  : undefined;

const key = (soid: bigint) => soid.toString(16).padStart(16, "0");

function read(): Journal {
  const file = path();
  if (!file || !existsSync(file)) {
    return {schema: 1, policy: POLICY, version: 0, tombstones: []};
  }
  const value = JSON.parse(readFileSync(file, "utf8")) as Journal;
  if (value.schema !== 1 || value.policy !== POLICY ||
      !Number.isSafeInteger(value.version) || value.version < 0 ||
      !Array.isArray(value.tombstones) || value.tombstones.length > MAX_TOMBSTONES) {
    throw new Error("Invalid dismantle journal");
  }
  const identities = new Set<string>();
  for (const entry of value.tombstones) {
    if (!entry || !/^[0-9a-f]{16}$/.test(entry.soid) ||
        !Number.isSafeInteger(entry.defIndex) || entry.defIndex < 0 || entry.defIndex > 0xffff ||
        !Number.isSafeInteger(entry.actionIndex) || entry.actionIndex !== entry.defIndex ||
        typeof entry.removedAt !== "string" || Number.isNaN(Date.parse(entry.removedAt)) ||
        identities.has(entry.soid)) {
      throw new Error("Invalid dismantle journal entry");
    }
    identities.add(entry.soid);
  }
  if (value.version !== value.tombstones.length) {
    throw new Error("Invalid dismantle journal version");
  }
  return value;
}

export function isDismantled(soid: bigint): boolean {
  return dismantledItemSoids().has(soid);
}

/** One fresh journal read for a complete catalog, not one read per item.
 * No persistent cache: the next catalog observes newly committed removals. */
export function dismantledItemSoids(): ReadonlySet<bigint> {
  return new Set(read().tombstones.map(entry => BigInt(`0x${entry.soid}`)));
}

export function dismantleVersion(): number {
  return read().version;
}

/** Commit the captured native hold-X action before acknowledging it. */
export function dismantleItem(
  soid: bigint,
  item: DismantleItem | undefined,
  actionIndex: number,
  flag: boolean,
  equippedSoid?: bigint,
): DismantleResult {
  const journal = read();
  const identity = key(soid);
  const prior = journal.tombstones.find(entry => entry.soid === identity);
  if (prior) {
    return flag && actionIndex === prior.actionIndex
      ? {accepted: true, changed: false, reason: "already-dismantled"}
      : {accepted: false, changed: false, reason: "retry-does-not-match-tombstone"};
  }
  if (!flag) return {accepted: false, changed: false, reason: "native-instance-flag-required"};
  if (!item || item.soid !== soid) return {accepted: false, changed: false, reason: "item-not-owned"};
  if (actionIndex !== item.defIndex) return {accepted: false, changed: false, reason: "action-definition-mismatch"};
  if (!DISMANTLABLE_BUCKETS.has(item.bucket)) {
    return {accepted: false, changed: false, reason: "item-type-protected"};
  }
  if (equippedSoid === soid) return {accepted: false, changed: false, reason: "equipped-item-protected"};
  if (journal.tombstones.length >= MAX_TOMBSTONES) {
    return {accepted: false, changed: false, reason: "dismantle-journal-full"};
  }
  const file = path();
  if (!file) return {accepted: false, changed: false, reason: "profile-path-missing"};

  const next: Journal = {
    ...journal,
    version: journal.version + 1,
    tombstones: [...journal.tombstones, {
      soid: identity,
      defIndex: item.defIndex,
      actionIndex,
      removedAt: new Date().toISOString(),
    }],
  };
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temporary, file);
  return {accepted: true, changed: true, reason: "captured-native-hold-x"};
}
