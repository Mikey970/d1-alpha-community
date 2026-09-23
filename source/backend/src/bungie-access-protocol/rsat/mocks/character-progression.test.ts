import { describe, it, expect } from 'vitest';
import { strikeCharacterLevel } from './character-progression';
import { stubSelfCharacter, stubGearCf } from './values';

describe('coherent strike character progression', () => {
  it('uses the native inclusive level-six XP boundary', () => {
    expect(strikeCharacterLevel(38999)).toBe(5);
    expect(strikeCharacterLevel(39000)).toBe(6);
    expect(strikeCharacterLevel(48999)).toBe(6);
    expect(strikeCharacterLevel(49000)).toBe(7);
  });
  it('publishes category12 once and a matching GearCF level, preserving prior categories', () => {
    const rows = stubSelfCharacter(0xd1a0000000000001n).unknown7.unknown0;
    expect(rows.filter(row => row.unknown0 === 12)).toEqual([
      {unknown0:12, unknown1:69000, unknown2:0, unknown3:0},
    ]);
    expect(rows.filter(row => row.unknown0 !== 12).map(row=>row.unknown0)).toEqual([1,2,3,4,5]);
    expect(stubGearCf().unknown0).toBe(9);
  });
});

it('matches the extracted level15 threshold without overstating a partial level',()=>{
  expect(strikeCharacterLevel(128999)).toBe(14);
  expect(strikeCharacterLevel(129000)).toBe(15);
});
