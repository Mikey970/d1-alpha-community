import {characterLocal} from '../../character-context';
import {characterSetting} from '../../character-context';
import {e3SubclassItem} from "./e3-subclass-items";
import {configuredCharacterClass} from './configured-character-class';
import {WARLOCK_STARTER_ARMOR} from './warlock-starter-armor';
import {e3ArmorBaseDefinition} from './e3-armor-items';
import {e3WeaponItems,e3WeaponDefault} from './e3-weapons';
import {e3AppearancePreset} from './e3-appearance';
import { talentVersion as hunterGhostVersion } from "./hunter-ghost-state";
import {armorTalentVersion} from "./armor-talents";
import { talentVersion as titanArcVersion } from "./titan-arc-state";
import {weaponTalentVersion,weaponBaseStats} from "./weapon-talents";
import {repeatRewardItems,configureRepeatRewardBaseOccupancy} from './repeat-strike-rewards';
import {strikeRewardOwned,strikeRewardVersion} from "./strike-rewards";
import { talentVersion as hunterArcVersion } from "./hunter-arc-state";
import { talentVersion as radianceVersion } from "./radiance-state";
import { EquipmentState } from "./equipment-state";
import { talentVersion, TALENT_ITEM_SOID } from "./talent-state";
import {dismantleItem, dismantleVersion, dismantledItemSoids} from "./dismantle-state";
import { vendorEconomy } from "../../vendor-economy";

// This file is a mess. I haven't dug into character data very much.
// Please rewrite this all lol
// - codie

// Keep the rendered r164 equipment topology intact. The slot-to-bucket table
// is not authoritative for the other item identities yet.
export const EQUIP_SLOT_PRIMARY = 7;
export const EQUIP_SLOT_ABILITY = 1;
export const EQUIP_SLOT_HELMET = 2;
export const EQUIP_SLOT_GAUNTLETS = 3;
export const EQUIP_SLOT_CHEST = 4;
export const EQUIP_SLOT_LEGS = 5;
export const EQUIP_SLOT_CLASS_ITEM = 6;
export const EQUIP_SLOT_SPECIAL = 8;
export const EQUIP_SLOT_HEAVY = 9;
export const EQUIP_SLOT_SHIP = 10;
export const EQUIP_SLOT_GHOST = 11;
export const EQUIP_SLOT_VEHICLE = 12;
export const EQUIP_SLOT_VEHICLE_UI = 13;

export const ITEM_SOID_BASE = 0x0000000300000001n;

export function itemSoidForSlot(slot: number): bigint {
  return ITEM_SOID_BASE + BigInt(slot);
}

// Separate bag item. 808E2C32 supplies this complete equipment tuple and
// ordered stats; the proven 934 rifle stays equipped until transaction 403.
const INVENTORY_WEAPONS = [
      // Packaged Hunter Ghost Gun item438/grid247; independent test ownership.
      { soid: 0x0000000300000204n, defIndex: 438, bucket: 7,
        slot: EQUIP_SLOT_ABILITY, artArrangement: -1, sandboxPattern: -1, stats: [] as const },
      { soid: 0x0000000300000100n, defIndex: 935, bucket: 3,
        slot: EQUIP_SLOT_PRIMARY, artArrangement: 681, sandboxPattern: 5,
        stats: [[5, 0], [6, 3], [9, 3], [10, 3], [11, 1], [8, 3], [7, 1], [5, 5]] as const },
      // Complete authored 808E2C33 scout tuple; separate bag identity.
      { soid: 0x0000000300000101n, defIndex: 936, bucket: 3,
        slot: EQUIP_SLOT_PRIMARY, artArrangement: 684, sandboxPattern: 9,
        stats: [[5, 0], [6, 3], [9, 4], [10, 2], [11, 2], [8, 2], [7, 2], [5, 5]] as const },
      // Authored special item 808E2C35; leaves the proven shotgun in its bag.
      { soid: 0x0000000300000102n, defIndex: 938, bucket: 4,
        slot: EQUIP_SLOT_SPECIAL, artArrangement: 678, sandboxPattern: 11,
        stats: [[5, 0], [6, 3], [9, 2], [17, 2], [11, 2], [8, 3], [7, 1], [5, 5]] as const },
      // Native808E2C4B, UI subtype FNV-1(hand_cannon)=C8CC993A.
      // Own item and exact ordered stats; select through inventory transaction403.
      { soid: 0x0000000300000103n, defIndex: 960, bucket: 3,
        slot: EQUIP_SLOT_PRIMARY, artArrangement: 679, sandboxPattern: 12,
        stats: [[5,0],[5,6],[6,3],[9,2],[10,3],[11,1],[8,2],[7,2],[5,5]] as const },
      // Native tier 3 (superior), complete authored tuples; independent owned items.
      { soid: 0x0000000300000104n, defIndex: 823, bucket: 3,
        slot: EQUIP_SLOT_PRIMARY, artArrangement: 550, sandboxPattern: 12,
        stats: [[5,0],[6,1],[9,4],[10,2],[11,2],[8,2],[7,2]] as const },
      { soid: 0x0000000300000105n, defIndex: 827, bucket: 4,
        slot: EQUIP_SLOT_SPECIAL, artArrangement: 576, sandboxPattern: 13,
        stats: [[5,0],[6,1],[9,5],[10,4],[11,0],[8,2],[7,2]] as const },
      { soid: 0x0000000300000106n, defIndex: 831, bucket: 5,
        slot: EQUIP_SLOT_HEAVY, artArrangement: 563, sandboxPattern: 15,
        stats: [[5,0],[6,3],[9,3],[17,3],[18,1],[8,2],[10,2]] as const },
      // Additional complete Superior records; bag-only until native Equip403.
      { soid: 0x0000000300000107n, defIndex: 809, bucket: 3,
        slot: EQUIP_SLOT_PRIMARY, artArrangement: 558, sandboxPattern: 5,
        stats: [[5,0],[6,3],[9,2],[10,2],[11,2],[8,3],[7,1]] as const },
      { soid: 0x0000000300000108n, defIndex: 819, bucket: 4,
        slot: EQUIP_SLOT_SPECIAL, artArrangement: 546, sandboxPattern: 11,
        stats: [[5,0],[6,3],[9,4],[17,3],[11,2],[8,2],[7,1]] as const },
      { soid: 0x0000000300000109n, defIndex: 839, bucket: 5,
        slot: EQUIP_SLOT_HEAVY, artArrangement: 554, sandboxPattern: 14,
        stats: [[5,0],[6,3],[9,3],[10,3],[11,2],[8,3],[7,0]] as const },
      // User-requested Superior inventory additions, not mission-earned loot.
      { soid: 0x000000030000010an, defIndex: 807, bucket: 3,
        slot: 7, artArrangement: 544, sandboxPattern: 1,
        stats: [[5, 0], [6, 3], [9, 2], [10, 2], [11, 2], [8, 2], [7, 2]] as const },
      { soid: 0x000000030000010bn, defIndex: 814, bucket: 3,
        slot: 7, artArrangement: 567, sandboxPattern: 9,
        stats: [[5, 0], [6, 1], [9, 5], [10, 3], [11, 1], [8, 2], [7, 2]] as const },
      { soid: 0x000000030000010cn, defIndex: 835, bucket: 4,
        slot: 8, artArrangement: 572, sandboxPattern: 10,
        stats: [[5, 0], [6, 2], [9, 3], [10, 0], [11, 2], [8, 1], [7, 3]] as const },
      // Actual Warlock ability identity; FF native signed pattern is -1.
      { soid: TALENT_ITEM_SOID, defIndex: 442, bucket: 7,
        slot: EQUIP_SLOT_ABILITY, artArrangement: -1, sandboxPattern: -1,
        stats: [] as const },
      // Independent authored Warlock Radiance item, selected through native403.
      { soid: 0x0000000300000201n, defIndex: 441, bucket: 7,
        slot: EQUIP_SLOT_ABILITY, artArrangement: -1, sandboxPattern: -1,
        stats: [] as const },
      // Additional authored Superior hand_cannon; independently owned.
      { soid: 0x000000030000010dn, defIndex: 824, bucket: 3,
        slot: 7, artArrangement: 551, sandboxPattern: 12,
        stats: [[5,0],[6,5],[9,3],[10,2],[11,1],[8,3],[7,2]] as const },
      // Additional authored Superior sniper_rifle; independently owned.
      { soid: 0x000000030000010en, defIndex: 828, bucket: 4,
        slot: 8, artArrangement: 577, sandboxPattern: 13,
        stats: [[5,0],[6,3],[9,4],[10,4],[11,1],[8,2],[7,1]] as const },
      { soid: 0x0000000300000202n, defIndex: 437, bucket: 7,
        slot: EQUIP_SLOT_ABILITY, artArrangement: -1, sandboxPattern: -1,
        stats: [] as const },
      // Actual victory award only; absent from inventory until durable grant.
      { soid: 0x0000000300000300n, defIndex: 836, bucket: 4, slot: 8,
        artArrangement: 573, sandboxPattern: 10, stats: [[5, 0], [6, 3], [9, 2], [10, 0], [11, 3], [8, 2], [7, 1]] as const },
// User-requested native Superior additions.
      // Complete native rifle replaces the invisible, incomplete exotic prototype.
      // Preserve its local inventory identity; this is an explicit repair, not earned loot.
      {soid:0x0000000300000450n,defIndex:934,bucket:3,slot:7,
        artArrangement:676,sandboxPattern:1,
        stats:[[5,0],[6,2],[9,4],[10,4],[11,0],[8,2],[7,2],[5,5]] as const},
// Isolated dual-route test: SMG carrier26 and original laser-blaster11.
  {soid:0x0000000300000401n,defIndex:820,bucket:4,slot:8,artArrangement:707,sandboxPattern:26,stats:[[5, 0], [6, 5], [9, 3], [17, 1], [11, 1], [8, 3], [7, 3]] as const},
  {soid:0x0000000300000403n,defIndex:820,bucket:4,slot:8,artArrangement:547,sandboxPattern:11,stats:[[5, 0], [6, 5], [9, 3], [17, 1], [11, 1], [8, 3], [7, 3]] as const},
  {soid:0x0000000300000402n,defIndex:840,bucket:5,slot:9,artArrangement:555,sandboxPattern:14,stats:[[5, 0], [6, 2], [9, 2], [10, 2], [11, 3], [8, 0], [7, 3]] as const},
      // Authored Titan Fist of Havoc identity; independently persisted.
      { soid: 0x0000000300000203n, defIndex: 434, bucket: 7,
        slot: EQUIP_SLOT_ABILITY, artArrangement: -1, sandboxPattern: -1, stats: [] as const },
  {soid:0x0000000300000420n,defIndex:104,bucket:8,slot:2,artArrangement:99,sandboxPattern:-1,stats:[[0, 0], [3, 3]] as const},
  {soid:0x0000000300000421n,defIndex:91,bucket:9,slot:3,artArrangement:86,sandboxPattern:-1,stats:[[0, 0], [1, 3]] as const},
  {soid:0x0000000300000422n,defIndex:97,bucket:10,slot:4,artArrangement:92,sandboxPattern:-1,stats:[[0, 0], [1, 7]] as const},
  {soid:0x0000000300000423n,defIndex:110,bucket:11,slot:5,artArrangement:105,sandboxPattern:-1,stats:[[0, 0], [2, 3]] as const},
  {soid:0x0000000300000424n,defIndex:101,bucket:12,slot:6,artArrangement:96,sandboxPattern:-1,stats:[[0, 0], [3, 2]] as const},
] as const;

// Reserve the first-victory identity even before it is earned, so its later
// grant cannot collide with repeat rewards. Includes every seeded bag item.
configureRepeatRewardBaseOccupancy(()=>{
  const counts:Record<number,number>={3:1,4:1,5:1,8:1,9:1,10:1,11:1,12:1};
  for(const item of seededInventory())if(item.bucket in counts)counts[item.bucket]++;
  return counts;
});

/** Native layout counts from investment-global item layout 80801AA0. */
export const INVENTORY_BUCKET_BAG_COUNT: Readonly<Record<number, number>> = {
  0: 10, 1: 20, 2: 10, 3: 10, 4: 10, 5: 10, 6: 20, 7: 5,
  8: 10, 9: 10, 10: 10, 11: 10, 12: 10, 13: 10, 14: 10, 15: 10,
};

// One fixed equipped item is published in each of these native bag buckets.
// Keep this above EquipmentState construction: STUB_ITEM_DEFS is initialized later.
const FIXED_BAG_ITEM_COUNT: Readonly<Record<number, number>> = {
  3: 1, 4: 1, 5: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1,
  12: 1, 13: 1, 14: 1, 15: 1,
};

export type OwnedWeapon = {soid:bigint;defIndex:number;bucket:number;slot:number;artArrangement:number;sandboxPattern:number;stats:readonly (readonly [number,number])[];quantity?:number;equipReady?:boolean};
function seededInventory(): readonly OwnedWeapon[] {
  return configuredCharacterClass() === 3 ? [...INVENTORY_WEAPONS, ...WARLOCK_STARTER_ARMOR] : INVENTORY_WEAPONS;
}
function fullInventoryCatalog(): readonly OwnedWeapon[] {
  const dismantled = dismantledItemSoids();
  const preset=e3WeaponItems();
  const seeded = seededInventory();
  const catalog=preset ? [...seeded.filter(item=>
    // Bucket7 occupies bag60..64; seeding all five subclass alternatives plus
    // the base item overwrote helmet bag65. E3 owns its authored subclass.
    item.slot===1 ? item.soid===e3WeaponDefault(1) :
    // Complete native pulse rifle and machine gun alongside SMG/laser options.
    // Recovered preset slot assignments remain available as separate items.
    item.slot<7 || item.slot>9 || item.soid===0x300000107n || item.soid===0x300000401n || item.soid===0x300000402n || item.soid===0x300000403n),...preset,...(e3SubclassItem() ? [e3SubclassItem()!] : [])] : seeded;
  const selected = characterSetting('D1A_DIRECTOR_CHARACTER');
  const subclassDefinitions = selected?.startsWith('hunter-') ? [437,438] :
    selected?.startsWith('warlock-') ? [441,442] : selected === 'titan-arc' ? [434] : undefined;
  const items=[...catalog.filter(item=>(item.defIndex!==836||strikeRewardOwned()) &&
    (!subclassDefinitions || item.slot!==1 || subclassDefinitions.includes(item.defIndex))),
    ...repeatRewardItems(),...vendorEconomy().inventoryItems()].filter(item=>!dismantled.has(item.soid));
  const used:Record<number,number>={...FIXED_BAG_ITEM_COUNT};
  return items.filter(item=>{
    const capacity=INVENTORY_BUCKET_BAG_COUNT[item.bucket]??0;
    if((used[item.bucket]??0)>=capacity)return false;
    used[item.bucket]=(used[item.bucket]??0)+1;
    return true;
  });
}
export function inventoryWeapons(): readonly OwnedWeapon[] {
  return process.env.D1A_INVENTORY_PROBE_ITEM === "1"
    ? fullInventoryCatalog()
    : [];
}

export function inventoryProbeItem() {
  return inventoryWeapons()[0];
}

export function ownedInventoryItem(soid:bigint):OwnedWeapon|undefined {
  const bag=inventoryWeapons().find(item=>item.soid===soid);
  if(bag)return bag;
  const original=characterItemDefinitions().find(item=>[7,8,9].includes(item.slot)&&itemSoidForSlot(item.slot)===soid);
  const stats=original&&weaponBaseStats(original.defIndex);
  return original&&stats?{...original,soid,stats}:undefined;
}
export function equippedInventoryProbe(slot = EQUIP_SLOT_PRIMARY) {
  return ownedInventoryItem(equippedItemSoid(slot));
}

// Isolated single-character research state, shared by the BAP connections.
// Item identities in the bag stay fixed when equipment changes.
const originalWeapons = [EQUIP_SLOT_ABILITY, EQUIP_SLOT_HELMET, EQUIP_SLOT_GAUNTLETS, EQUIP_SLOT_CHEST, EQUIP_SLOT_LEGS, EQUIP_SLOT_CLASS_ITEM, EQUIP_SLOT_PRIMARY, EQUIP_SLOT_SPECIAL, EQUIP_SLOT_HEAVY]
  .map(slot => ({ slot, soid: itemSoidForSlot(slot) }));
const equipment = characterLocal(() => new EquipmentState(
  Object.fromEntries(originalWeapons.map(item => [item.slot, (item.slot===1 ? e3SubclassItem()?.soid : undefined) ?? e3WeaponDefault(item.slot) ?? item.soid])),
  () => [...originalWeapons, ...inventoryWeapons(), ...([7,8,9].filter(slot=>e3WeaponDefault(slot)===0n).map(slot=>({slot,soid:0n})))],
  process.env.D1A_INVENTORY_PROBE_ITEM === "1" ? characterSetting('D1A_EQUIPMENT_PROFILE') : undefined,
));

export function currentEquipmentVersion(): number {
  return (inventoryProbeItem() ? equipment().version : 1) + talentVersion() + radianceVersion() + hunterArcVersion() + hunterGhostVersion() + titanArcVersion() + strikeRewardVersion() + weaponTalentVersion() + armorTalentVersion() + dismantleVersion() + vendorEconomy().version;
}

export function equippedItemSoid(slot: number): bigint {
  return inventoryProbeItem()
    ? equipment().selectedForSlot(slot) ?? itemSoidForSlot(slot)
    : itemSoidForSlot(slot);
}

export function equipInventoryProbe(soid: bigint): boolean {
  const probe = inventoryProbeItem();
  if (!probe || (!originalWeapons.some(item => item.soid === soid)
      && !inventoryWeapons().some(item => item.soid === soid && item.equipReady !== false))) {
    return false;
  }
  try {
    return equipment().equip(soid);
  } catch (error) {
    console.error("D1A_EQUIPMENT_SAVE_FAILED; equip rejected", error);
    return false;
  }
}

/** Launcher loadouts share native ownership checks and one durable commit. */
export function equipInventoryLoadout(soids: readonly bigint[]): boolean {
  if (!inventoryProbeItem() || soids.some(soid =>
    !originalWeapons.some(item => item.soid === soid && [7,8,9].includes(item.slot)) &&
    !inventoryWeapons().some(item => item.soid === soid && [7,8,9].includes(item.slot) && item.equipReady !== false))) return false;
  return equipment().equipMany(soids);
}

export function inventoryBucketOccupancy(): Readonly<Record<number, number>> {
  const counts: Record<number, number> = {};
  for (const item of characterItemDefinitions()) counts[item.bucket] = (counts[item.bucket] ?? 0) + 1;
  for (const item of inventoryWeapons()) counts[item.bucket] = (counts[item.bucket] ?? 0) + 1;
  return counts;
}

export function dismantleInventoryItem(soid: bigint, actionIndex: number, flag: boolean) {
  const item = fullInventoryCatalog().find(candidate => candidate.soid === soid);
  return dismantleItem(soid, item, actionIndex, flag,
    item ? equipment().selectedForSlot(item.slot) : undefined);
}

const BASE_ITEM_DEFS: {
  slot: number;
  bucket: number;
  defIndex: number;
  artArrangement: number;
  sandboxPattern: number;
  label: string;
}[] = [
  {
    slot: EQUIP_SLOT_ABILITY,
    bucket: 7,
    defIndex: 434,
    artArrangement: -1,
    sandboxPattern: -1,
    label: "ability",
  },
  {
    slot: EQUIP_SLOT_PRIMARY,
    bucket: 3,
    defIndex: 934,
    artArrangement: 676,
    // 808E2C31 equipment component +1A, read natively by 82B5FB1C.
    // Pair pattern 1 with its packaged art 676; art 632/pattern 1 crashed at spawn.
    sandboxPattern: 1,
    label: "primary",
  },
  {
    slot: EQUIP_SLOT_SPECIAL,
    bucket: 4,
    defIndex: 937,
    // Alpha definition 808E2C34: equipment component +18/+1A.
    // Native 82B5FAF4 and 82B5FB1C read these exact fields.
    artArrangement: 686,
    sandboxPattern: 10,
    label: "secondary",
  },
  {
    slot: EQUIP_SLOT_HEAVY,
    bucket: 5,
    defIndex: 961,
    // Authored 808E2C4C equipment component, audited in weapon-catalog.json.
    artArrangement: 680,
    sandboxPattern: 14,
    label: "heavy",
  },
  {
    slot: EQUIP_SLOT_HELMET,
    bucket: 8,
    defIndex: 204,
    artArrangement: 211,
    sandboxPattern: -1,
    label: "helmet",
  },
  {
    slot: EQUIP_SLOT_GAUNTLETS,
    bucket: 9,
    defIndex: 210,
    artArrangement: 198,
    sandboxPattern: -1,
    label: "gauntlets",
  },
  {
    slot: EQUIP_SLOT_CHEST,
    bucket: 10,
    defIndex: 216,
    artArrangement: 204,
    sandboxPattern: -1,
    label: "chest",
  },
  {
    slot: EQUIP_SLOT_LEGS,
    bucket: 11,
    defIndex: 220,
    artArrangement: 217,
    sandboxPattern: -1,
    label: "legs",
  },
  {
    slot: EQUIP_SLOT_CLASS_ITEM,
    bucket: 12,
    defIndex: 223,
    artArrangement: 208,
    sandboxPattern: -1,
    label: "class_item",
  },
  {
    slot: EQUIP_SLOT_SHIP,
    bucket: 13,
    defIndex: 760,
    artArrangement: -1,
    sandboxPattern: 0,
    label: "ship",
  },
  {
    slot: EQUIP_SLOT_GHOST,
    bucket: 14,
    defIndex: 943,
    artArrangement: 641,
    sandboxPattern: 0,
    label: "ghost",
  },
  {
    slot: EQUIP_SLOT_VEHICLE,
    bucket: 15,
    defIndex: 450,
    artArrangement: -1,
    sandboxPattern: 0,
    label: "sparrow",
  },
];

export const characterItemDefinitions = characterLocal(() =>
  BASE_ITEM_DEFS.map(item => ({...item, ...e3ArmorBaseDefinition(item.slot)})));
// Compatibility export for consumers of the original launcher profile.
export const STUB_ITEM_DEFS = characterItemDefinitions();

export const CHAR_CLASS_NONE = 0;
export const CHAR_CLASS_GUARDIAN = 1;
export const CHAR_CLASS_HUNTER = 2;
export const CHAR_CLASS_WARLOCK = 3;

export const CHAR_CLASS_TITAN = CHAR_CLASS_GUARDIAN;
export const STUB_CHARACTER_CLASS = configuredCharacterClass();

export const STUB_FACE_INDEX = 364;

export const STUB_SKIN_COLOR = 1;
export const STUB_LIP_COLOR = 1;
export const STUB_EYE_COLOR = 1;
export const STUB_HAIR_COLOR = 1;
export const STUB_FEATURE_COLOR = 1;
export const STUB_DECAL_COLOR = 1;

export const STUB_RACE_INDEX = 0;
export const STUB_GENDER_INDEX = e3AppearancePreset()?.gender ?? 0;

export const EQUIP_SLOT_TO_BUCKET: readonly number[] = [
  1, 2, 3, 4, 5, 6, 10, 12, 11, 7, 8, 9, 13, 15, 14,
];

export const INVENTORY_BUCKET_BAG_START: Readonly<Record<number, number>> = {
  // Native 62_80801AA0 disk+2C: currency bucket0 starts at0, count10.
  0: 0,
  1: 30,
  2: 50,
  3: 115,
  4: 125,
  5: 135,
  6: 10,
  7: 60,
  8: 65,
  9: 75,
  10: 85,
  11: 95,
  12: 105,
  13: 145,
  14: 155,
  15: 165,
};

export function bagIndexForBucket(bucket: number): number {
  const start = INVENTORY_BUCKET_BAG_START[bucket];
  return start === undefined ? -1 : start;
}

export interface StubAbilityEntry {
  option?: number;
  slot: number;
}

export const STUB_ABILITY_LOADOUT: readonly StubAbilityEntry[] = [
  { slot: 1 },
  { slot: 2 },
  { slot: 3 },
  { slot: 4 },
  { slot: 5 },
];
