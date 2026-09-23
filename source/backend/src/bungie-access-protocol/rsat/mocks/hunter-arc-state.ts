import {characterLocal} from '../../character-context';
import {characterSetting} from '../../character-context';
import {vendorEconomy} from "../../vendor-economy";
import native from "./hunter-arc-native.json";
import type { rsat } from "@blamnetwork/rsat";
import type { Unknown808019AE } from "../../queuez/families/self";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";

export const TALENT_ITEM_SOID = 0x0000000300000202n;
export const TALENT_ITEM_DEFINITION = 437;
export const TALENT_GRID_INDEX = 246;
export const TALENT_PROGRESSION_CATEGORY = 12;
// Explicit diagnostic progression, not mission-earned XP. Native8368C854 uses
// inclusive category12 thresholds: level7 at49000. Character XP is separate.
export const TALENT_TEST_XP = process.env.D1A_CHARACTER_LEVEL15 === "1" ? 129000 : 49000;
export const TALENT_ARC_NODE = 25;

export function talentIntrinsicPerks(): number[] {
  if (talentProbeEnabled()) loadPersistedState();
  // Native837287D0 enumerates selected step perks before definition intrinsics.
  const steps = native.nodes.filter(n => state().purchased.includes(n.node) && n.perk >= 0).map(n => n.perk);
  return [...steps, ...native.intrinsics];
}

// Exact grid246 first-acquisition rules are checked during native extraction.
const NODES: Record<number, {slot:number;level:number;group:string}> = Object.fromEntries(
  native.nodes.filter(n => !n.grant).map(n => [n.node, {slot:n.slot,level:n.level,
    group:n.group === "811c9dc5" ? `node${n.node}` : n.group}]));
function statePath() {
  const novaPath = characterSetting('D1A_TALENT_STATE_PATH');
  return novaPath ? `${novaPath}.hunter-arc.json` : undefined;
}


function validSelection(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(n => Number.isInteger(n) && NODES[n]) &&
    new Set(value.map(n => NODES[n]!.group)).size === value.length;
}

function loadPersistedState(): void {
  const committed = vendorEconomy().talentSelection(TALENT_ITEM_SOID);
  if (committed) {
    if (committed.definition !== TALENT_ITEM_DEFINITION || committed.grid !== TALENT_GRID_INDEX ||
        ![49000, TALENT_TEST_XP].includes(committed.testXp) || !validSelection(committed.purchased)) {
      throw new Error("Invalid committed subclass talent selection");
    }
    state().purchased = [...committed.purchased]; state().revision = committed.version;
    return;
  }
  const path = statePath();
  if (!path || state().loadedPath === path) return;
  if (existsSync(path)) {
    const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (saved.schema !== 2 || saved.itemSoid !== TALENT_ITEM_SOID.toString(16) ||
        saved.definition !== TALENT_ITEM_DEFINITION || saved.grid !== TALENT_GRID_INDEX ||
        ![49000, TALENT_TEST_XP].includes(Number(saved.testXp)) || !validSelection(saved.purchased) ||
        !["client-801-with-explicit-test-progression", "user-requested-hunter-arc-test"].includes(String(saved.provenance)) ||
        !Number.isSafeInteger(saved.version) || Number(saved.version) < 1) {
      throw new Error("Invalid persisted Hunter talent test state");
    }
    state().purchased = [...saved.purchased];
    state().revision = Number(saved.version);
  }
  state().loadedPath = path;
}

export function talentProbeEnabled(): boolean { return process.env.D1A_TALENT_PROBE === "1"; }
export function talentVersion(): number {
  if (talentProbeEnabled()) loadPersistedState();
  return state().revision;
}
export function talentValue(): rsat.Infer<typeof Unknown808019AE> {
  if (talentProbeEnabled()) loadPersistedState();
  const ranks = Array.from({ length: 50 }, () => 0);
  // Native836BDA50 grants these three nodes for grid246.
  for (const node of [14, 17, 22]) ranks[node] = 1;
  const bindings = [22, -1, 14, -1, 17];
  for (const node of state().purchased) {
    ranks[node] = 1;
    if (NODES[node]!.slot >= 0) bindings[NODES[node]!.slot] = node;
  }
  return {
    unknown0: TALENT_GRID_INDEX,
    unknown1: { unknown0: TALENT_PROGRESSION_CATEGORY,
      unknown1: talentProbeEnabled() ? TALENT_TEST_XP : 0, unknown2: 0, unknown3: 0 },
    unknown2: 0, unknown3: 0,
    unknown4: { unknown0: ranks },
    unknown5: { unknown0: bindings.map(node => ({ unknown0: node, unknown1: node < 0 ? -1 : 0 })) },
  };
}
export interface TalentMutationResult { accepted: boolean; changed: boolean; reason: string; }
const reject = (reason: string): TalentMutationResult => ({ accepted: false, changed: false, reason });
export function activateTalentStep(itemSoid: bigint, nodeIndex: number, swap=false): TalentMutationResult {
  if (!talentProbeEnabled()) return reject("probe-disabled");
  if (itemSoid !== TALENT_ITEM_SOID) return reject("not-owned-hunter-test-item");
  const node = NODES[nodeIndex];
  if (!node) return reject("node-not-supported-or-requires-level9-plus");
  try {
    loadPersistedState();
    if (state().purchased.includes(nodeIndex)) return { accepted: true, changed: false, reason: "already-selected" };
    const alternative = state().purchased.find(n => NODES[n]!.group === node.group);
    if (swap && alternative === undefined) return reject("talent-swap-needs-active-group");
    if (!swap && alternative !== undefined) return reject("exclusive-alternative-requires-native802-swap");
    if (node.level > (TALENT_TEST_XP===129000?15:7)) return reject("insufficient-talent-progression");
    const next = [...state().purchased.filter(n=>!swap||NODES[n]!.group!==node.group), nodeIndex];
    const path = statePath();
    if (swap || vendorEconomy().talentSelection(TALENT_ITEM_SOID)) {
      if (!vendorEconomy().commitTalentSelection(TALENT_ITEM_SOID, {
        definition: TALENT_ITEM_DEFINITION, grid: TALENT_GRID_INDEX,
        purchased: next, version: state().revision + 1, testXp: TALENT_TEST_XP,
      }, swap)) return reject("insufficient-talent-swap-currency");
    } else if (path) {
      const temporary = `${path}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ schema: 2,
        itemSoid: TALENT_ITEM_SOID.toString(16), definition: TALENT_ITEM_DEFINITION,
        grid: TALENT_GRID_INDEX, purchased: next, version: state().revision + 1,
        provenance: "client-801-with-explicit-test-progression", testXp: TALENT_TEST_XP,
        updatedAt: new Date().toISOString(),
      }, null, 2)}\n`, "utf8");
      renameSync(temporary, path);
    }
    state().purchased = next;
    state().revision++;
  } catch (error) { return reject(`talent-state-write-failed:${String(error)}`); }
  return { accepted: true, changed: true, reason: `hunter-grid246-node${nodeIndex}-step0-slot${node.slot}` };
}
export function swapTalentNode(itemSoid: bigint, nodeIndex: number): TalentMutationResult {
  if(process.env.D1A_VENDOR_ECONOMY!=="1")return reject("talent-swap-economy-required");
  return activateTalentStep(itemSoid,nodeIndex,true);
}
export function resetTalentStateForTests(): void { state().revision = 0; state().purchased = []; state().loadedPath = undefined; }


export function talentAbilityRecords() {
  const abilities = Object.fromEntries(native.nodes.map(n => [n.node,n.ability]));
  return talentValue().unknown5!.unknown0.map(binding => ({
    unknown0: binding.unknown0 === undefined || binding.unknown0 < 0
      ? -1 : abilities[binding.unknown0]!,
    unknown1: { unknown0: Array.from({length:8}, (_,index) => {
      const ability = binding.unknown0 !== undefined ? abilities[binding.unknown0] : -1;
      const modifiers = native.nodes.filter(n => state().purchased.includes(n.node) &&
        n.modifierAbility === ability && n.modifierHash !== 0x811c9dc5).map(n => n.modifierHash);
      return modifiers[index] ?? 0x811c9dc5;
    }) },
  }));
}

const state = characterLocal(() => ({revision: 0, purchased: [] as number[], loadedPath: undefined as string | undefined}));
