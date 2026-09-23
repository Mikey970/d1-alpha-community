import {currentCharacterContext} from '../../character-context';
import {configuredCharacterClass} from './configured-character-class';
import {e3AppearancePreset} from './e3-appearance';
import {characterItemDefinitions} from './loadout';
import {e3EquippedAbilities,e3EquippedIntrinsics,e3SubclassValue} from "./e3-subclass-items";
import {e3SubclassIntrinsics} from './e3-subclass-intrinsics';
import {e3ArmorAppearance} from './e3-appearance';
import { e3AbilityRecords } from './e3-ability-preset';
import { TALENT_ITEM_SOID as GHOST_SOID, talentValue as ghostValue, talentAbilityRecords as ghostAbilities, talentIntrinsicPerks as ghostPerks } from "./hunter-ghost-state";
import {armorTalentValue,armorPerks,armorStats,armorGlobalModifiers} from "./armor-talents";
import { TALENT_ITEM_SOID as TITAN_SOID, talentValue as titanValue, talentAbilityRecords as titanAbilities, talentIntrinsicPerks as titanPerks } from "./titan-arc-state";
import {weaponTalentValue,weaponPerks,weaponStats} from "./weapon-talents";
import { TALENT_ITEM_SOID as ARC_SOID, talentValue as arcValue, talentAbilityRecords as arcAbilities, talentIntrinsicPerks as arcPerks } from "./hunter-arc-state";
import { TALENT_ITEM_SOID as RADIANCE_SOID, talentValue as radianceValue, talentAbilityRecords as radianceAbilities, talentIntrinsicPerks as radiancePerks } from "./radiance-state";
// This file is a mess. I haven't dug into character data very much.
// Please rewrite this all lol
// - codie

import type {
  AppearanceEcValue,
  AppearanceF0Value,
  GearCfValue,
  InspectionCharacterValue,
  InventoryItemValue,
  PeerCharacterValue,
  SelfCharacterValue,
  SelectCharacterCharacterValue,
} from "../../queuez";
import { EMPTY_STRING_HASH, SELF_CHECKSUM_ITEM } from "../constants";
import { strikeCharacterLevel, strikeCharacterProgression } from './character-progression';
import { talentProbeEnabled, talentValue, talentAbilityRecords, talentIntrinsicPerks, TALENT_ITEM_SOID } from "./talent-state";
import {
  bagIndexForBucket,
  equippedItemSoid,
  equippedInventoryProbe,
  EQUIP_SLOT_HELMET,
  EQUIP_SLOT_SPECIAL,
  EQUIP_SLOT_HEAVY,
  EQUIP_SLOT_VEHICLE,
  EQUIP_SLOT_VEHICLE_UI,
  INVENTORY_BUCKET_BAG_START,
  INVENTORY_BUCKET_BAG_COUNT,
  inventoryWeapons,
  ITEM_SOID_BASE,
  itemSoidForSlot,
  STUB_ABILITY_LOADOUT,
  STUB_CHARACTER_CLASS,
  STUB_DECAL_COLOR,
  STUB_EYE_COLOR,
  STUB_FACE_INDEX,
  STUB_FEATURE_COLOR,
  STUB_GENDER_INDEX,
  STUB_HAIR_COLOR,
  STUB_ITEM_DEFS,
  STUB_LIP_COLOR,
  STUB_RACE_INDEX,
  STUB_SKIN_COLOR,
} from "./loadout";

const EMPTY_DYE = { unknown0: -1 as number, unknown1: -1 as number };
const EMPTY_DYES = {
  unknown0: [EMPTY_DYE, EMPTY_DYE, EMPTY_DYE, EMPTY_DYE, EMPTY_DYE, EMPTY_DYE],
};

const GEAR_CF_CATEGORY_INDICES = [28, 15, 7, 9, 13] as const;

const GEAR_CF_BFB1: readonly number[] = [
  912, 439, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
];
const GEAR_CF_BFB2: readonly number[] = [
  543, 435, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
];

type GearCfC5 = readonly [number, number];
const GEAR_CF_BFC: readonly (readonly GearCfC5[])[] = [
  [
    [0, 146],
    [2, 7],
    [3, 1],
    [4, 3],
    [5, 10],
    [6, 40],
    [7, 55],
    [28, 90],
  ],
  // Definition 934, 808E2C31 component 80801A1A: eight packaged stat rows.
  // The former primary stat 11 = 157 exceeds its native seven-entry curve.
  // Keep packaged ordering, including its repeated stat 5.
  [
    [5, 0],
    [6, 2],
    [9, 4],
    [10, 4],
    [11, 0],
    [8, 2],
    [7, 2],
    [5, 5],
  ],
  // Definition 937, 808E2C34: native ordered shotgun stat rows.
  [
    [5, 0],
    [6, 3],
    [9, 2],
    [15, 2],
    [11, 2],
    [8, 1],
    [7, 3],
    [5, 5],
  ],
  // Definition 961, 808E2C4C: all nine native stat rows in authored order.
  [
    [5, 0],
    [5, 6],
    [6, 5],
    [9, 0],
    [10, 1],
    [11, 3],
    [8, 1],
    [7, 3],
    [5, 5],
  ],
];

function pad16(values: readonly number[], fill = -1): number[] {
  return Array.from({ length: 16 }, (_, i) =>
    i < values.length ? values[i]! : fill
  );
}

function bfcSlots(pairs: readonly GearCfC5[]) {
  return Array.from({ length: 16 }, (_, i) => {
    const [a, b] = i < pairs.length ? pairs[i]! : ([-1, 0] as const);
    return { unknown0: a, unknown1: b };
  });
}

function emptyEquipSlot() {
  return {
    soid: 0n,
    defIndex: -1,
    unknown2: 0,
    unknown3: -1,
    unknown4: EMPTY_DYES,
  };
}

function stubEquipSlots() {
  const slots = Array.from({ length: 20 }, () => emptyEquipSlot());
  for (const g of characterItemDefinitions()) {
    if (equippedItemSoid(g.slot) === 0n) continue;
    const probe = equippedInventoryProbe(g.slot);
    const equipped = probe?.slot === g.slot ? probe : g;
    const appearance = equippedItemSoid(g.slot) === itemSoidForSlot(g.slot)
      ? e3ArmorAppearance(g.slot) : undefined;
    slots[g.slot] = {
      soid: equippedItemSoid(g.slot),
      defIndex: equipped.defIndex,
      unknown2: equipped.sandboxPattern,
      unknown3: appearance?.art ?? equipped.artArrangement,
      unknown4: appearance?.dyes ?? EMPTY_DYES,
    };
  }
  const veh = characterItemDefinitions().find((g) => g.slot === EQUIP_SLOT_VEHICLE);
  if (veh) {
    slots[EQUIP_SLOT_VEHICLE_UI] = {
      soid: itemSoidForSlot(veh.slot),
      defIndex: veh.defIndex,
      unknown2: veh.sandboxPattern,
      unknown3: veh.artArrangement,
      unknown4: EMPTY_DYES,
    };
  }
  return slots;
}

export function stubAppearanceEc(): AppearanceEcValue {
  const saved = currentCharacterContext().appearance?.();
  if (saved?.identity) return saved.identity;
  return {
    race: STUB_RACE_INDEX,
    gender: e3AppearancePreset()?.gender ?? 0,
    classIndex: Math.max(0, configuredCharacterClass() - 1),
  };
}

export function stubAppearanceF0(): AppearanceF0Value {
  const saved = currentCharacterContext().appearance?.();
  if (saved?.appearance) return saved.appearance;
  return {
    faceIndex: STUB_FACE_INDEX,
    hairIndex: 0,
    featureIndex: 0,
    decalIndex: 0,
    skinColor: STUB_SKIN_COLOR,
    lipColor: STUB_LIP_COLOR,
    eyeColor: STUB_EYE_COLOR,
    hairColor: STUB_HAIR_COLOR,
    featureColor: STUB_FEATURE_COLOR,
    decalColor: STUB_DECAL_COLOR,
    personalityId: 0,
    helmetPreference: 0,
  };
}

export function stubGearCf(): GearCfValue {
  const warlockEquipped = talentProbeEnabled() && equippedItemSoid(1) === TALENT_ITEM_SOID;
  const radianceEquipped = talentProbeEnabled() && equippedItemSoid(1) === RADIANCE_SOID;
  const ghostEquipped = talentProbeEnabled() && equippedItemSoid(1) === GHOST_SOID;
  const arcEquipped = talentProbeEnabled() && equippedItemSoid(1) === ARC_SOID;
  const titanEquipped = talentProbeEnabled() && equippedItemSoid(1) === TITAN_SOID;
  const armorItems = [2,3,4,5,6].map(slot=>equippedInventoryProbe(slot)).filter((item):item is NonNullable<typeof item>=>item!==undefined);
  const subclassPerks = e3EquippedIntrinsics(equippedItemSoid(1)) ?? (ghostEquipped ? ghostPerks() : titanEquipped ? titanPerks() : arcEquipped ? arcPerks() : radianceEquipped ? radiancePerks() : warlockEquipped ? talentIntrinsicPerks() : []);
  const intrinsicPerks = [...subclassPerks,...armorPerks(armorItems)];
  const armorModifiers = armorGlobalModifiers(armorItems);
  return {
    unknown0: strikeCharacterLevel(),
    unknown1: {
      // Native83728FD4/837279A8 derives GearCF+4 from the equipped talent item.
      unknown0: e3EquippedAbilities(equippedItemSoid(1)) ?? (ghostEquipped ? ghostAbilities() : titanEquipped ? titanAbilities() : arcEquipped ? arcAbilities() : radianceEquipped ? radianceAbilities() : warlockEquipped
        ? talentAbilityRecords() : GEAR_CF_CATEGORY_INDICES.map((index) => ({
        unknown0: index,
        unknown1: {
          unknown0: Array.from({ length: 8 }, () => EMPTY_STRING_HASH),
        },
      }))),
    },
    unknown2: {
      unknown0: Array.from({ length: 32 }, (_,index) => armorModifiers[index] ?? EMPTY_STRING_HASH),
    },
    unknown3: { unknown0: stubEquipSlots() },
    unknown4: {
      unknown0: Array.from({ length: 8 }, () => ({
        unknown0: -1,
        soid: 0n,
      })),
    },
    // Native83729294/837287D0 projects equipped nonweapon intrinsic perks
    // into GearCF+4D8 (26 slots), preserving their authored order.
    unknown5: { unknown0: Array.from({ length: 26 }, (_, index) =>
      intrinsicPerks[index] ?? -1) },
    unknown6: { unknown0: pad16(weaponPerks(equippedInventoryProbe()) ?? []) },
    unknown7: { unknown0: pad16(weaponPerks(equippedInventoryProbe(EQUIP_SLOT_SPECIAL)) ?? []) },
    unknown8: { unknown0: pad16(weaponPerks(equippedInventoryProbe(EQUIP_SLOT_HEAVY)) ?? []) },
    unknown9: { unknown0: bfcSlots(armorStats(armorItems,GEAR_CF_BFC[0]!)) },
    unknown10: { unknown0: bfcSlots(weaponStats(equippedInventoryProbe(),equippedInventoryProbe()?.stats ?? GEAR_CF_BFC[1]!)) },
    unknown11: { unknown0: bfcSlots(weaponStats(equippedInventoryProbe(EQUIP_SLOT_SPECIAL),equippedInventoryProbe(EQUIP_SLOT_SPECIAL)?.stats ?? GEAR_CF_BFC[2]!)) },
    unknown12: { unknown0: bfcSlots(equippedItemSoid(EQUIP_SLOT_HEAVY) === 0n ? [] : weaponStats(equippedInventoryProbe(EQUIP_SLOT_HEAVY),equippedInventoryProbe(EQUIP_SLOT_HEAVY)?.stats ?? GEAR_CF_BFC[3]!)) },
  };
}

export function stubPeerCharacter(characterSoid: bigint): PeerCharacterValue {
  return {
    soid: characterSoid,
    unknown1: stubAppearanceEc(),
    unknown2: stubAppearanceF0(),
    unknown3: stubGearCf(),
  };
}

/** Native 80801A00 selection card for the currently loaded character profile. */
export function stubSelectCharacter(characterSoid: bigint): SelectCharacterCharacterValue {
  const character = stubSelfCharacter(characterSoid);
  return {
    soid: characterSoid,
    appearanceEc: character.unknown1,
    appearanceF0: character.unknown2,
    progression: character.unknown8,
    unknown4: undefined,
    gear: stubGearCf(),
  };
}

export function stubInspectionCharacter(
  characterSoid: bigint
): InspectionCharacterValue {
  return {
    soid: characterSoid,
    unknown1: stubAppearanceEc(),
    unknown2: stubAppearanceF0(),
    // Dirty idx 6 → empty 808017D3 nest must be present.
    unknown3: { unknown0: [] },
    unknown4: undefined,
    unknown5: undefined,
    unknown6: undefined,
    unknown7: undefined,
    unknown8: undefined,
    unknown9: undefined,
    unknown10: stubGearCf(),
  };
}

function emptyBagEntry() {
  return {
    defIndex: -1,
    soid: 0n,
    unknown2: 0,
    unknown3: 0,
  };
}

function stubBagSlots() {
  const slots = Array.from({ length: 256 }, () => emptyBagEntry());
  for (const g of characterItemDefinitions()) {
    const bagIndex = bagIndexForBucket(g.bucket);
    if (bagIndex < 0) {
      continue;
    }
    slots[bagIndex] = {
      defIndex: g.defIndex,
      soid: itemSoidForSlot(g.slot),
      unknown2: 1,
      unknown3: 0,
    };
  }
  const nextBagOffset = new Map(characterItemDefinitions().map((item) => [item.bucket, 1]));
  for (const probe of inventoryWeapons()) {
    const offset = nextBagOffset.get(probe.bucket) ?? 0;
    if (offset >= (INVENTORY_BUCKET_BAG_COUNT[probe.bucket] ?? 0)) {
      throw new Error(`Inventory bucket ${probe.bucket} exceeds its native capacity`);
    }
    nextBagOffset.set(probe.bucket, offset + 1);
    slots[bagIndexForBucket(probe.bucket) + offset] = {
      defIndex: probe.defIndex,
      soid: probe.soid,
      unknown2: probe.quantity ?? 1,
      unknown3: 0,
    };
  }
  return slots;
}

function stubEquippedSoids() {
  const soids = Array.from({ length: 20 }, () => 0n);
  for (const g of characterItemDefinitions()) {
    soids[g.slot] = equippedItemSoid(g.slot);
  }
  soids[EQUIP_SLOT_VEHICLE_UI] = itemSoidForSlot(EQUIP_SLOT_VEHICLE);
  return soids;
}

function stubCharacterProgression() {
  return {
    unknown0: [...STUB_ABILITY_LOADOUT.map((row) => ({
      unknown0: row.slot,
      unknown1: row.option ?? 0,
      unknown2: 0,
      unknown3: 0,
    })), strikeCharacterProgression()],
  };
}

export function stubSelfCharacter(characterSoid: bigint): SelfCharacterValue {
  const presetHelmet = equippedItemSoid(EQUIP_SLOT_HELMET) === itemSoidForSlot(EQUIP_SLOT_HELMET)
    ? e3ArmorAppearance(EQUIP_SLOT_HELMET)?.art : undefined;
  const helmetArt = presetHelmet ?? equippedInventoryProbe(EQUIP_SLOT_HELMET)?.artArrangement ??
    characterItemDefinitions().find((g) => g.slot === EQUIP_SLOT_HELMET)?.artArrangement ??
    316;
  return {
    soid: characterSoid,
    unknown1: stubAppearanceEc(),
    unknown2: stubAppearanceF0(),
    unknown3: {
      unknown0: 256,
      unknown1: { unknown0: stubBagSlots() },
    },
    unknown4: { unknown0: stubEquippedSoids() },
    unknown5: {
      unknown0: helmetArt,
      unknown1: 0,
      unknown2: 0,
      unknown3: false,
    },
    unknown6: undefined,
    unknown7: stubCharacterProgression(),
    unknown8: {
      unknown0: 1,
      unknown1: 1,
      unknown2: 0,
      unknown3: 5,
      unknown4: undefined,
      // Shared dirty idx 6 is set by inventory bag → dump emits this u64 as 0.
      unknown5: 0n,
      unknown6: undefined,
      unknown7: undefined,
    },
    unknown9: undefined,
    unknown10: undefined,
    unknown11: undefined,
    unknown12: undefined,
    unknown13: undefined,
    unknown14: undefined,
    unknown15: undefined,
    unknown16: undefined,
    unknown17: undefined,
    unknown18: undefined,
  };
}

/** Sparse 80801BD0 slots matching dump shared dirty {0} or {0,2}. */
export function stubSelfAfSlots(
  hasCharacterSoid: boolean
): (number | undefined)[] {
  const slots: (number | undefined)[] = Array.from(
    { length: 128 },
    () => undefined
  );
  slots[0] = 0;
  if (hasCharacterSoid) {
    slots[2] = 0;
  }
  return slots;
}

export function stubInventoryItem(
  soid: bigint,
  defIndex: number,
  equipSlot = -1
): InventoryItemValue {
  const weaponTalent = weaponTalentValue(soid,defIndex);
  const unknown4 =
    equipSlot >= 0 && equipSlot < 0x14
      ? {
          unknown0: 0,
          unknown1: {
            unknown0: equipSlot,
            unknown1: 0,
            unknown2: 0,
            // Shared dirty idx 3 is not set on item stubs.
            unknown3: undefined,
          },
          unknown2: undefined,
          unknown3: undefined,
          unknown4: undefined,
          unknown5: undefined,
        }
      : undefined;
  return {
    soid,
    defIndex,
    unknown2: {
      unknown0: -1,
      unknown1: 0n,
    },
    unknown3: undefined,
    unknown4: e3SubclassValue(soid,defIndex) ?? armorTalentValue(soid,defIndex) ?? (defIndex === 438 && soid === GHOST_SOID && talentProbeEnabled() ? ghostValue() : defIndex === 434 && soid === TITAN_SOID && talentProbeEnabled() ? titanValue() : defIndex === 437 && soid === ARC_SOID && talentProbeEnabled() ? arcValue() : defIndex === 441 && soid === RADIANCE_SOID && talentProbeEnabled()
      ? radianceValue() : defIndex === 442 && soid === TALENT_ITEM_SOID && talentProbeEnabled()
      ? talentValue() : weaponTalent ?? unknown4),
  };
}

export function stubInventoryItemObject(
  soid: bigint,
  defIndex: number,
  equipSlot = -1
): { value: InventoryItemValue; headerChecksum: number; soid: bigint } {
  return {
    soid,
    headerChecksum: SELF_CHECKSUM_ITEM,
    value: stubInventoryItem(soid, defIndex, equipSlot),
  };
}

export {
  bagIndexForBucket,
  INVENTORY_BUCKET_BAG_START,
  ITEM_SOID_BASE,
  itemSoidForSlot,
  STUB_ITEM_DEFS,
};
