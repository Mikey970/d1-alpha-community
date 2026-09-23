import { describe, expect, it } from "vitest";
import { decode } from "@blamnetwork/rsat";
import { SelectCharacterCharacter, SelectCharacterPrimary } from "../../queuez";
import { buildSelectCharacterBaselineBody } from "./families";
import { stubSelectCharacter, stubSelfCharacter, stubGearCf } from "./values";

describe("native character-selection family", () => {
  it("resolves every advertised character to its own native appearance and gear object", () => {
    const first = stubSelectCharacter(2n);
    const second = { ...first, soid: 3n, appearanceEc: { ...first.appearanceEc, classIndex: 3 } };
    const wire = buildSelectCharacterBaselineBody(1n, 1n, 7, undefined, [first, second]);
    expect(wire.readUInt32BE(0)).toBe(1);
    expect(wire.readUInt32BE(4)).toBe(3);
    expect(wire.readBigUInt64BE(8)).toBe(1n);
    expect(wire.readUInt32BE(16)).toBe(7);
    expect(wire.readUInt32BE(21)).toBe(3);
    let offset = 25;
    const objects = [];
    for (let index = 0; index < 3; index++) {
      const checksum = wire.readUInt32BE(offset);
      const soid = wire.readBigUInt64BE(offset + 4);
      const length = wire.readUInt32BE(offset + 12);
      objects.push({ checksum, soid, payload: wire.subarray(offset + 16, offset + 16 + length) });
      offset += 16 + length;
    }
    expect(offset).toBe(wire.length);
    expect(objects[0].checksum).toBe(0x0aa5f881);
    expect(decode(SelectCharacterPrimary, objects[0].payload).roster?.soids).toEqual([2n, 3n]);
    for (const [index, character] of [first, second].entries()) {
      const object = objects[index + 1];
      // Guest descriptor 80801A00 at 823202C4, instance type 3412A58D.
      expect(object.checksum).toBe(0x3412a58d);
      expect(object.soid).toBe(character.soid);
      const value = decode(SelectCharacterCharacter, object.payload);
      expect(value.soid).toBe(character.soid);
      expect(value.appearanceEc).toEqual(character.appearanceEc);
      expect(value.appearanceF0).toEqual(stubSelfCharacter(2n).unknown2);
      const gear = stubGearCf();
      expect(value.gear?.unknown0).toBe(gear.unknown0);
      expect(value.gear?.unknown3).toEqual(gear.unknown3);
      expect(value.gear?.unknown9).toEqual(gear.unknown9);
      expect(value.gear?.unknown10).toEqual(gear.unknown10);
      expect(value.gear?.unknown11).toEqual(gear.unknown11);
      expect(value.gear?.unknown12).toEqual(gear.unknown12);
      // The dependency decodes 32-bit hashes as signed numbers; wire bits agree.
      expect(value.gear?.unknown2?.unknown0.map((hash) => hash >>> 0)).toEqual(gear.unknown2.unknown0);
    }
  });

  it("rejects ambiguous, missing, and overflowing identities instead of publishing a broken roster", () => {
    const character = stubSelectCharacter(2n);
    for (const roster of [
      [character, character],
      [{ ...character, soid: 0n }],
      [{ ...character, soid: -1n }],
      [{ ...character, soid: 0x10000000000000000n }],
      [{ ...character, soid: undefined }],
      [{ ...character, soid: 1n }],
      Array.from({ length: 11 }, (_, index) => ({ ...character, soid: BigInt(index + 2) })),
    ]) {
      expect(() => buildSelectCharacterBaselineBody(1n, 1n, 1, undefined, roster)).toThrow(/identities/);
    }
  });
});
