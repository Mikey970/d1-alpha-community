import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeServerMessage, encodeServerMessage } from "@blamnetwork/rsat";
import { Unknown80801BFA } from "../../queuez/shared";
import { equippedItemSoid, equipInventoryProbe, itemSoidForSlot } from "./loadout";
import { TALENT_ITEM_SOID, resetTalentStateForTests } from "./talent-state";
import { stubGearCf } from "./values";

afterEach(() => { vi.unstubAllEnvs(); resetTalentStateForTests(); });

describe("equipped Warlock intrinsic perk projection", () => {
  it("publishes authored perks only after equip, preserves weapon data, and removes perks on unequip", () => {
    vi.stubEnv("D1A_INVENTORY_PROBE_ITEM", "1");
    vi.stubEnv("D1A_TALENT_PROBE", "1");
    vi.stubEnv("D1A_TALENT_STATE_PATH", "");
    const original = equippedItemSoid(1);
    try {
      expect(equipInventoryProbe(itemSoidForSlot(1))).toBe(true);
      const before = stubGearCf();
      expect(before.unknown5?.unknown0).toEqual(Array(26).fill(-1));
      expect(equipInventoryProbe(TALENT_ITEM_SOID)).toBe(true);
      const after = stubGearCf();
      const expected = [96, 97, 98, 95, ...Array(22).fill(-1)];
      expect(after.unknown5?.unknown0).toEqual(expected);
      const encoded = encodeServerMessage(0, Unknown80801BFA, after.unknown5!);
      expect(decodeServerMessage(encoded, Unknown80801BFA).value.unknown0).toEqual(expected);
      expect(after.unknown7).toEqual(before.unknown7);
      expect(after.unknown8).toEqual(before.unknown8);
      expect(after.unknown10).toEqual(before.unknown10);
      expect(after.unknown11).toEqual(before.unknown11);
      expect(after.unknown12).toEqual(before.unknown12);
      expect(equipInventoryProbe(itemSoidForSlot(1))).toBe(true);
      expect(stubGearCf()).toEqual(before);
    } finally {
      equipInventoryProbe(original);
    }
  });
});
