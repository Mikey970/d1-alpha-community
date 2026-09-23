import { describe, expect, it, vi } from "vitest";
import {
  bagIndexForBucket,
  EQUIP_SLOT_HELMET,
  EQUIP_SLOT_PRIMARY,
  EQUIP_SLOT_SPECIAL,
  itemSoidForSlot,
  STUB_ITEM_DEFS,
  currentEquipmentVersion,
  equipInventoryProbe,
  inventoryProbeItem,
  inventoryWeapons, equippedItemSoid,
} from "./loadout";
import { stubGearCf, stubSelfCharacter } from "./values";

describe("stub equipped loadout", () => {
  it("transacts the separate Warlock item and high-tier weapons while preserving bag ownership", () => {
    vi.stubEnv("D1A_INVENTORY_PROBE_ITEM", "1");
    vi.stubEnv("D1A_TALENT_PROBE", "1");
    const before = stubGearCf();
    const bag = stubSelfCharacter(0x1234n).unknown3;
    try {
      for (const defIndex of [442, 823, 827, 831]) {
        const item = inventoryWeapons().find(item => item.defIndex === defIndex)!;
        expect(equipInventoryProbe(item.soid)).toBe(true);
        expect(stubGearCf().unknown3.unknown0[item.slot]).toMatchObject({
          soid: item.soid, defIndex, unknown2: item.sandboxPattern, unknown3: item.artArrangement,
        });
        expect(stubSelfCharacter(0x1234n).unknown3).toEqual(bag);
      }
    } finally {
      for (const slot of [1, 7, 8, 9]) equipInventoryProbe(before.unknown3.unknown0[slot]!.soid);
      vi.unstubAllEnvs();
    }
  });
  it("projects the transacted item identity, model, pattern and stats together and restores the rifle", () => {
    vi.stubEnv("D1A_INVENTORY_PROBE_ITEM", "1");
    const original = itemSoidForSlot(EQUIP_SLOT_PRIMARY);
    try {
      equipInventoryProbe(original);
      const before = stubGearCf();
      const version = currentEquipmentVersion();
      expect(equipInventoryProbe(0xdeadbeefn)).toBe(false);
      expect(currentEquipmentVersion()).toBe(version);
      const probe = inventoryWeapons().find(item => item.defIndex === 935)!;
      expect(equipInventoryProbe(probe.soid)).toBe(true);
      const after = stubGearCf();
      expect(after.unknown3.unknown0[7]).toMatchObject({
        soid: probe.soid, defIndex: 935, unknown2: 5, unknown3: 681,
      });
      expect(after.unknown10.unknown0.slice(0, 8).map(row => [row.unknown0, row.unknown1]))
        .toEqual([[5, 5], [6, 3], [7, 1], [8, 3], [9, 3], [10, 3], [11, 1], [-1, 0]]);
      expect(after.unknown3.unknown0.filter((_, i) => i !== 7))
        .toEqual(before.unknown3.unknown0.filter((_, i) => i !== 7));
      const scout = inventoryWeapons().find(item => item.defIndex === 936)!;
      const bagBefore = stubSelfCharacter(0x1234n).unknown3;
      expect(equipInventoryProbe(scout.soid)).toBe(true);
      const scoutGear = stubGearCf();
      expect(scoutGear.unknown3.unknown0[7]).toMatchObject({
        soid: scout.soid, defIndex: 936, unknown2: 9, unknown3: 684,
      });
      expect(scoutGear.unknown10.unknown0.slice(0, 8).map(row => [row.unknown0, row.unknown1]))
        .toEqual([[5, 5], [6, 3], [7, 2], [8, 2], [9, 4], [10, 2], [11, 2], [-1, 0]]);
      // Equip must not create, remove or renumber any owned item.
      expect(stubSelfCharacter(0x1234n).unknown3).toEqual(bagBefore);
      expect(bagBefore?.unknown1?.unknown0.slice(115, 118).map(item => item.defIndex))
        .toEqual([934, 935, 936]);
      expect(equipInventoryProbe(original)).toBe(true);
      expect(stubGearCf()).toEqual(before);
    } finally {
      equipInventoryProbe(original);
      vi.unstubAllEnvs();
    }
  });
  it("places the Alpha primary with its packaged firing pattern in the native slot", () => {
    const primary = STUB_ITEM_DEFS.find((item) => item.label === "primary");

    expect(EQUIP_SLOT_PRIMARY).toBe(7);
    expect(primary).toMatchObject({
      slot: EQUIP_SLOT_PRIMARY,
      bucket: 3,
      defIndex: 934,
      artArrangement: 676,
      sandboxPattern: 1,
    });
    expect(itemSoidForSlot(EQUIP_SLOT_PRIMARY)).toBe(0x0000000300000008n);
    expect(bagIndexForBucket(3)).toBe(115);
    expect(
      STUB_ITEM_DEFS.filter((item) => item.slot === EQUIP_SLOT_PRIMARY)
    ).toHaveLength(1);
  });

  it("equips a special item without changing primary, heavy or bag ownership", () => {
    vi.stubEnv("D1A_INVENTORY_PROBE_ITEM", "1");
    const originalSpecial = itemSoidForSlot(EQUIP_SLOT_SPECIAL);
    try {
      const before = stubGearCf();
      const bag = stubSelfCharacter(0x1234n).unknown3;
      const special = inventoryWeapons().find(item => item.defIndex === 938)!;
      expect(equipInventoryProbe(special.soid)).toBe(true);
      const after = stubGearCf();
      expect(after.unknown3.unknown0[8]).toMatchObject({
        soid: special.soid, defIndex: 938, unknown2: 11, unknown3: 678,
      });
      expect(after.unknown11.unknown0.slice(0, 8).map(row => [row.unknown0, row.unknown1]))
        .toEqual([[5, 5], [6, 3], [7, 1], [8, 3], [9, 2], [11, 2], [17, 2], [-1, 0]]);
      expect(after.unknown3.unknown0.filter((_, index) => index !== 8))
        .toEqual(before.unknown3.unknown0.filter((_, index) => index !== 8));
      expect(after.unknown10).toEqual(before.unknown10);
      expect(after.unknown12).toEqual(before.unknown12);
      expect(stubSelfCharacter(0x1234n).unknown3).toEqual(bag);
      expect(bag?.unknown1?.unknown0.slice(125, 127).map(item => item.defIndex))
        .toEqual([937, 938]);
      expect(equipInventoryProbe(originalSpecial)).toBe(true);
      expect(stubGearCf()).toEqual(before);
    } finally {
      equipInventoryProbe(originalSpecial);
      vi.unstubAllEnvs();
    }
  });

  it("retains the helmet in equipment slot 2", () => {
    const helmet = STUB_ITEM_DEFS.find((item) => item.label === "helmet");

    expect(EQUIP_SLOT_HELMET).toBe(2);
    expect(helmet).toMatchObject({
      slot: EQUIP_SLOT_HELMET,
      bucket: 8,
      defIndex: 204,
      artArrangement: 211,
      sandboxPattern: -1,
    });
    expect(itemSoidForSlot(EQUIP_SLOT_HELMET)).toBe(0x0000000300000003n);
  });

  it("does not duplicate any staged equipment slot", () => {
    const slots = STUB_ITEM_DEFS.map((item) => item.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

it('equips the complete native replacement rifle and restores original equipment',()=>{
 const old=process.env.D1A_INVENTORY_PROBE_ITEM;process.env.D1A_INVENTORY_PROBE_ITEM='1';
 const original=equippedItemSoid(7);
 try {
  const item=inventoryWeapons().find(i=>i.soid===0x0000000300000450n)!;
  expect(item).toMatchObject({bucket:3,slot:7,artArrangement:676,sandboxPattern:1});
  expect(equipInventoryProbe(item.soid)).toBe(true);
  expect(stubGearCf().unknown3.unknown0[7]).toMatchObject({soid:item.soid,defIndex:934,unknown2:1,unknown3:676});
 } finally {equipInventoryProbe(original);if(old===undefined)delete process.env.D1A_INVENTORY_PROBE_ITEM;else process.env.D1A_INVENTORY_PROBE_ITEM=old;}
});

