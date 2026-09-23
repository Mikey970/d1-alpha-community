import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Single local character. Commit to disk before acknowledging an equip. */
export class EquipmentState {
  private selected: Record<number, bigint>;
  version = 1;

  constructor(
    original: Readonly<Record<number, bigint>>,
    private readonly allowed: readonly { soid: bigint; slot: number }[] | (() => readonly {soid:bigint;slot:number}[]),
    private readonly file?: string,
  ) {
    this.selected = { ...original };
    if (!file) return;
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const saved = JSON.parse(raw);
    if (!Number.isInteger(saved.version) || saved.version < 1 || saved.version > 0x7fffffff) {
      throw new Error(`Invalid equipment profile: ${file}`);
    }
    // Read existing primary-only profiles without rewriting them at startup.
    const slots = saved.schema === 1 ? { 7: saved.primarySoid } : saved.slots;
    if (![1, 2].includes(saved.schema) || !slots || typeof slots !== "object" || Array.isArray(slots) ||
        (saved.schema === 2 && Object.keys(slots).length !== Object.keys(original).length &&
          !(Object.keys(original).length === 9 && Object.keys(slots).sort().join(",") === "1,7,8,9"))) {
      throw new Error(`Invalid equipment profile: ${file}`);
    }
    for (const [key, value] of Object.entries(slots)) {
      const slot = Number(key);
      if (String(slot) !== key || !(slot in original) || typeof value !== "string" ||
          !/^[0-9a-f]{16}$/.test(value)) throw new Error(`Invalid equipment profile: ${file}`);
      const soid = BigInt(`0x${value}`);
      if (!this.allowedItems().some(item => item.slot === slot && item.soid === soid)) {
        throw new Error(`Unknown equipped item in ${file}`);
      }
      this.selected[slot] = soid;
    }
    this.version = saved.version;
  }

  private allowedItems(){return typeof this.allowed === "function" ? this.allowed() : this.allowed;}

  selectedForSlot(slot: number): bigint | undefined {
    return this.selected[slot];
  }

  equip(soid: bigint): boolean {
    return this.equipMany([soid]);
  }

  /** Validate the whole loadout, then persist it in one atomic replacement. */
  equipMany(soids: readonly bigint[]): boolean {
    const allowed = this.allowedItems();
    const selected = { ...this.selected };
    const slots = new Set<number>();
    for (const soid of soids) {
      const item = allowed.find(item => item.soid === soid);
      if (!item || !(item.slot in selected) || slots.has(item.slot)) return false;
      slots.add(item.slot);
      selected[item.slot] = soid;
    }
    if ([...slots].every(slot => selected[slot] === this.selected[slot])) return true;
    const version = this.version === 0x7fffffff ? 1 : this.version + 1;
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      writeFileSync(temporary, JSON.stringify({
        schema: 2,
        slots: Object.fromEntries(Object.entries(selected).map(([slot, value]) =>
          [slot, value.toString(16).padStart(16, "0")])),
        version,
      }, null, 2) + "\n", "utf8");
      renameSync(temporary, this.file);
    }
    this.selected = selected;
    this.version = version;
    return true;
  }
}
