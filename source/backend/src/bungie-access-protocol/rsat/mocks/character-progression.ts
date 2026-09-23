// Explicit diagnostic character XP grant, independent of item442 talent XP.
// Native blueprint+C4 selects category12; 8368C854 consumes these authored costs.
export const STRIKE_CHARACTER_XP = process.env.D1A_CHARACTER_LEVEL15==='1'?129000:69000;
export function strikeCharacterLevel(xp = STRIKE_CHARACTER_XP): number {
  if (!Number.isInteger(xp) || xp < 0 || xp > 129000) throw new Error('Unsupported diagnostic character XP');
  let level = 0;
  // Captured native category12, 0x1380, eight-byte rows through level15.
  for (const cost of [0, 5000, 8000, 8000, 9000, 9000, ...Array(9).fill(10000)]) {
    if (xp < cost) break;
    xp -= cost;
    level++;
  }
  return level;
}
export function strikeCharacterProgression() {
  return { unknown0: 12, unknown1: STRIKE_CHARACTER_XP, unknown2: 0, unknown3: 0 };
}
