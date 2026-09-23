import {afterEach, expect, it, vi} from 'vitest';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resetTalentStateForTests, talentValue, talentIntrinsicPerks} from './talent-state';

afterEach(() => { vi.unstubAllEnvs(); resetTalentStateForTests(); });

/** The shipped profile state, so a bad edit fails here rather than at boot. */
const MAXED = {
  schema: 2, itemSoid: '300000200', definition: 442, grid: 251,
  purchased: [1, 21, 15, 11, 22], version: 4,
  provenance: 'client-801-with-explicit-test-progression', testXp: 49000,
};

function load(state: Record<string, unknown>) {
  vi.stubEnv('D1A_TALENT_PROBE', '1');
  const file = join(mkdtempSync(join(tmpdir(), 'd1a-talent-max-')), 'talent.json');
  writeFileSync(file, JSON.stringify(state));
  vi.stubEnv('D1A_TALENT_STATE_PATH', file);
}

it('accepts the maxed grid: level 7 progression with one node from every group', () => {
  load(MAXED);
  // 49000 is the inclusive category-12 threshold for level 7, the grid's top tier.
  expect(talentValue().unknown1.unknown1).toBe(49000);
  const selected = talentValue().unknown4!.unknown0;
  for (const node of MAXED.purchased) expect(selected[node]).not.toBe(0);
  // Melee modifier 11 and level-7 perk 22 are the two newly reachable groups.
  expect(selected[11]).not.toBe(0);
  expect(selected[22]).not.toBe(0);
  // Node 22 contributes intrinsic perk 51 ahead of the definition intrinsics.
  expect(talentIntrinsicPerks()).toEqual([51, 96, 97, 98, 95]);
});

it('rejects a grid level above 7, which this grid does not define', () => {
  // Guards against "just raise the XP": the loader only accepts 21000 or 49000,
  // and no node in grid 251 requires a level beyond 7.
  load({...MAXED, testXp: 69000});
  expect(() => talentValue()).toThrow();
});

it('rejects two nodes from the same group', () => {
  load({...MAXED, purchased: [1, 16, 21, 15, 11]});
  expect(() => talentValue()).toThrow();
});
