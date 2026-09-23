import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EquipmentState } from "./equipment-state";

const rifle = 0x0000000300000008n;
const burst = 0x0000000300000100n;
const shotgun = 0x0000000300000009n;
const special = 0x0000000300000102n;
const original = { 7: rifle, 8: shotgun };
const allowed = [{ soid: rifle, slot: 7 }, { soid: burst, slot: 7 },
  { soid: shotgun, slot: 8 }, { soid: special, slot: 8 }];

describe("durable local equipment", () => {
  it("commits a loadout once and rejects partial, unknown, or duplicate-slot updates", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1a-loadout-"));
    try {
      const file=join(dir,"equipment.json");
      const state=new EquipmentState(original,allowed,file);
      expect(state.equipMany([burst,special])).toBe(true);
      expect(state.version).toBe(2);
      const saved=readFileSync(file,"utf8");
      expect(state.equipMany([rifle,0xdeadn])).toBe(false);
      expect(state.equipMany([rifle,burst])).toBe(false);
      expect(readFileSync(file,"utf8")).toBe(saved);
      expect(new EquipmentState(original,allowed,file).selectedForSlot(7)).toBe(burst);
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  it("restores a committed native item identity and version across fresh stores", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1a-equipment-"));
    try {
      const file = join(dir, "profile.json");
      const first = new EquipmentState(original, allowed, file);
      expect(first.equip(burst)).toBe(true);
      expect(first.equip(special)).toBe(true);
      const saved = readFileSync(file, "utf8");
      expect(first.equip(0xdeadn)).toBe(false);
      expect(first.equip(burst)).toBe(true);
      expect(readFileSync(file, "utf8")).toBe(saved);
      const restored = new EquipmentState(original, allowed, file);
      expect([restored.selectedForSlot(7), restored.selectedForSlot(8), restored.version])
        .toEqual([burst, special, 3]);
      expect(restored.equip(rifle)).toBe(true);
      const restoredRifle = new EquipmentState(original, allowed, file);
      expect([restoredRifle.selectedForSlot(7), restoredRifle.selectedForSlot(8)])
        .toEqual([rifle, special]);
      writeFileSync(file, '{"schema":1,"primarySoid":"000000000000dead","version":3}');
      expect(() => new EquipmentState(original, allowed, file)).toThrow("Unknown equipped item");
      writeFileSync(file, JSON.stringify({ schema: 2, slots: {
        7: special.toString(16).padStart(16, "0"), 8: shotgun.toString(16).padStart(16, "0"),
      }, version: 3 }));
      expect(() => new EquipmentState(original, allowed, file)).toThrow("Unknown equipped item");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not commit in memory when durable storage fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1a-equipment-"));
    try {
      const file = join(dir, "profile.json");
      const state = new EquipmentState(original, allowed, file);
      // Make the parent a file after construction, forcing a real write failure.
      rmSync(dir, { recursive: true });
      writeFileSync(dir, "not a directory");
      expect(() => state.equip(special)).toThrow();
      expect([state.selectedForSlot(7), state.selectedForSlot(8), state.version])
        .toEqual([rifle, shotgun, 1]);
    } finally {
      rmSync(dir, { force: true });
    }
  });

  it("preserves a schema1 checkpoint until a successful equip migrates it", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1a-equipment-"));
    try {
      const file = join(dir, "profile.json");
      const legacy = '{"schema":1,"primarySoid":"0000000300000100","version":5}';
      writeFileSync(file, legacy);
      const state = new EquipmentState(original, allowed, file);
      expect([state.selectedForSlot(7), state.selectedForSlot(8), state.version])
        .toEqual([burst, shotgun, 5]);
      expect(readFileSync(file, "utf8")).toBe(legacy);
      expect(state.equip(special)).toBe(true);
      const restored = new EquipmentState(original, allowed, file);
      expect([restored.selectedForSlot(7), restored.selectedForSlot(8), restored.version])
        .toEqual([burst, special, 6]);
      expect(JSON.parse(readFileSync(file, "utf8")).schema).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
