import {characterLocal} from '../../character-context';
import {characterSetting} from '../../character-context';
import {vendorEconomy} from "../../vendor-economy";
import { TALENT_ITEM_SOID as GHOST_SOID, activateTalentStep as activateGhost, swapTalentNode as swapGhost } from "./hunter-ghost-state";
import { TALENT_ITEM_SOID as TITAN_SOID, activateTalentStep as activateTitan, swapTalentNode as swapTitan } from "./titan-arc-state";
import { TALENT_ITEM_SOID as ARC_SOID, activateTalentStep as activateArc, swapTalentNode as swapArc } from "./hunter-arc-state";
import { TALENT_ITEM_SOID as RADIANCE_SOID, activateTalentStep as activateRadiance, swapTalentNode as swapRadiance } from "./radiance-state";
import type { rsat } from "@blamnetwork/rsat";
import type { Unknown808019AE } from "../../queuez/families/self";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";

export const TALENT_ITEM_SOID = 0x0000000300000200n;
export const TALENT_ITEM_DEFINITION = 442;
export const TALENT_GRID_INDEX = 251;
export const TALENT_PROGRESSION_CATEGORY = 12;
// Explicit diagnostic progression, not mission-earned XP. Native8368C854 uses
// inclusive category12 thresholds: level7 at49000. Character XP is separate.
export const TALENT_TEST_XP = 49000;
export const TALENT_NOVA_NODE = 21;

/** Item442, tag808E2A45: its80801A1A component at file+104 has
 * count4 at component+54 and these four u16 intrinsic perks at+58.
 * Native837287D0 appends them after selected talent-step perks, independently
 * of purchased nodes. This is definition data, not a synthetic energy grant.
 */
export function talentIntrinsicPerks(): number[] {
  if (talentProbeEnabled()) loadPersistedState();
  // Native837287D0 enumerates selected step perks before definition intrinsics.
  const steps = [...state().purchased].sort((a,b)=>a-b).flatMap(node =>
    node === 22 ? [51] : node === 23 ? [49] : []);
  return [...steps, 96, 97, 98, 95];
}

// Authored3421_808019a1: one-step nodes, empty prerequisites/conditions/materials,
// zero point cost. Grenades override starter18; movement alternatives share a
// group. Native802 alternatives cost item456 x100, committed with the selection.
const NODES: Record<number, { slot: number; level: number; group: string }> = {
  0: { slot: 3, level: 3, group: "movement" },
  14: { slot: 3, level: 3, group: "movement" },
  15: { slot: 3, level: 3, group: "movement" },
  1: { slot: 0, level: 2, group: "grenade" },
  16: { slot: 0, level: 2, group: "grenade" },
  17: { slot: 0, level: 2, group: "grenade" },
  21: { slot: 1, level: 4, group: "super" },
  // These select modifiers/perks, not new ability-slot bindings.
  2: { slot: -1, level: 5, group: "melee-modifier" },
  11: { slot: -1, level: 5, group: "melee-modifier" },
  12: { slot: -1, level: 5, group: "melee-modifier" },
  22: { slot: -1, level: 7, group: "level7-perk" },
  23: { slot: -1, level: 7, group: "level7-perk" },
};


function validSelection(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(n => Number.isInteger(n) && NODES[n]) &&
    new Set(value.map(n => NODES[n]!.group)).size === value.length;
}

function loadPersistedState(): void {
  const committed = vendorEconomy().talentSelection(TALENT_ITEM_SOID);
  if (committed) {
    if (committed.definition !== TALENT_ITEM_DEFINITION || committed.grid !== TALENT_GRID_INDEX ||
        committed.testXp !== TALENT_TEST_XP || !validSelection(committed.purchased)) {
      throw new Error("Invalid committed Warlock talent selection");
    }
    state().purchased = [...committed.purchased]; state().revision = committed.version;
    return;
  }
  const path = characterSetting('D1A_TALENT_STATE_PATH');
  if (!path || state().loadedPath === path) return;
  if (existsSync(path)) {
    const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (saved.schema !== 2 || saved.itemSoid !== TALENT_ITEM_SOID.toString(16) ||
        saved.definition !== TALENT_ITEM_DEFINITION || saved.grid !== TALENT_GRID_INDEX ||
        ![21000, TALENT_TEST_XP].includes(Number(saved.testXp)) || !validSelection(saved.purchased) ||
        saved.provenance !== "client-801-with-explicit-test-progression" ||
        !Number.isSafeInteger(saved.version) || Number(saved.version) < 1) {
      throw new Error("Invalid persisted Warlock talent test state");
    }
    state().purchased = [...saved.purchased];
    state().revision = Number(saved.version) + (saved.testXp === TALENT_TEST_XP ? 0 : 1);
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
  // Native836BDA50 grants only these three nodes for grid251.
  for (const node of [10, 13, 18]) ranks[node] = 1;
  const bindings = [18, -1, 10, -1, 13];
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
export function activateTalentStep(itemSoid: bigint, nodeIndex: number, swap = false): TalentMutationResult {
  if (!talentProbeEnabled()) return reject("probe-disabled");
  if (itemSoid === TITAN_SOID) return activateTitan(itemSoid, nodeIndex);
  if (itemSoid === GHOST_SOID) return activateGhost(itemSoid, nodeIndex);
  if (itemSoid === ARC_SOID) return activateArc(itemSoid, nodeIndex);
  if (itemSoid === RADIANCE_SOID) return activateRadiance(itemSoid, nodeIndex);
  if (itemSoid !== TALENT_ITEM_SOID) return reject("not-owned-warlock-test-item");
  const node = NODES[nodeIndex];
  if (!node) return reject("node-not-supported-or-requires-level9-plus");
  try {
    loadPersistedState();
    if (state().purchased.includes(nodeIndex)) return { accepted: true, changed: false, reason: "already-selected" };
    const alternative = state().purchased.find(n => NODES[n]!.group === node.group);
    if (swap && alternative === undefined) return reject("talent-swap-needs-active-group");
    if (!swap && alternative !== undefined) return reject("exclusive-alternative-requires-native802-swap");
    if (node.level > 7) return reject("insufficient-talent-progression");
    const next = [...state().purchased.filter(n => !swap || NODES[n]!.group !== node.group), nodeIndex];
    const path = characterSetting('D1A_TALENT_STATE_PATH');
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
  return { accepted: true, changed: true, reason: `warlock-grid251-node${nodeIndex}-step0-slot${node.slot}` };
}
export function swapTalentNode(itemSoid: bigint, nodeIndex: number): TalentMutationResult {
  if(itemSoid===TITAN_SOID)return swapTitan(itemSoid,nodeIndex);
  if(itemSoid===GHOST_SOID)return swapGhost(itemSoid,nodeIndex);
  if(itemSoid===ARC_SOID)return swapArc(itemSoid,nodeIndex);
  if(itemSoid===RADIANCE_SOID)return swapRadiance(itemSoid,nodeIndex);
  if (process.env.D1A_VENDOR_ECONOMY !== "1") return reject("talent-swap-economy-required");
  return activateTalentStep(itemSoid, nodeIndex, true);
}
export function resetTalentStateForTests(): void { state().revision = 0; state().purchased = []; state().loadedPath = undefined; }


/** Native837279A8 -> GearCF+4: five80804BC7 records, stride0x24.
 * 83727B70 copies the chosen step ability index. 837268A8/83726E50
 * considers a modifier only when step+0x38 is a nonempty hash; every
 * base power step here has811C9DC5. Nodes2/11/12 target melee22 with68C8F859.
 * This projects only the supported subclass; unrelated equipment modifiers
 * are not inferred. The caller must use it only when item442 is equipped.
 */
export function talentAbilityRecords() {
  const abilities: Record<number, number> = {
    0: 7, 1: 41, 10: 22, 13: 20, 14: 2, 15: 7, 16: 26, 17: 32, 18: 23, 21: 12,
  };
  return talentValue().unknown5!.unknown0.map(binding => ({
    unknown0: binding.unknown0 === undefined || binding.unknown0 < 0
      ? -1 : abilities[binding.unknown0]!,
    unknown1: { unknown0: Array.from({ length: 8 }, (_, index) =>
      binding.unknown0 === 10 && index === 0 && state().purchased.some(n => [2,11,12].includes(n))
        ? 0x68c8f859 : 0x811c9dc5) },
  }));
}

const state = characterLocal(() => ({revision: 0, purchased: [] as number[], loadedPath: undefined as string | undefined}));
