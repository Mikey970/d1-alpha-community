import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import native from './weapon-talents-native.json';
import {mutateWeaponTalent,weaponTalentValue,weaponPerks,weaponStats,weaponTalentVersion} from './weapon-talents';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
function profile(){const dir=mkdtempSync(join(tmpdir(),'d1a-weapon-test-'));dirs.push(dir);vi.stubEnv('D1A_EQUIPMENT_PROFILE',join(dir,'equipment.json'));}
it('restores all complete native weapon grids with valid prerequisites and starter grants',()=>{
 // Includes the 18 recovered E3 weapon definitions added after the base census.
 profile();expect(Object.keys(native.weapons)).toHaveLength(198);
 for(const [definition,w] of Object.entries(native.weapons)){
  const value=weaponTalentValue(0x300000008n,Number(definition))!;
  expect(value.unknown0).toBe(w.grid);expect(value.unknown1.unknown0).toBe(w.category);
  for(const n of w.nodes){expect(n.prerequisites.every(i=>i>=0&&i<w.nodeCount)).toBe(true);expect(value.unknown4.unknown0[n.node]).toBe(n.autoGrant?1:0);}
 }
});
it('persists Crowd Control on its own weapon with native stat gains, and rejects premature or repeated spending',()=>{
 profile();const heavy={soid:0x300000109n,defIndex:839};
 expect(mutateWeaponTalent(heavy,3)?.accepted).toBe(false);
 expect(mutateWeaponTalent(heavy,0)?.accepted).toBe(true);
 expect(mutateWeaponTalent(heavy,3)?.accepted).toBe(true);
 expect(weaponPerks(heavy)).toContain(166);
 expect(weaponPerks({soid:0x300000402n,defIndex:840})).not.toContain(166);
 expect(weaponStats(heavy,[[5,0],[10,3]])).toEqual(expect.arrayContaining([[5,6],[10,5]]));
 const version=weaponTalentVersion(),points=weaponTalentValue(heavy.soid,839)!.unknown2;
 expect(mutateWeaponTalent(heavy,3)?.changed).toBe(false);
 expect(weaponTalentVersion()).toBe(version);expect(weaponTalentValue(heavy.soid,839)!.unknown2).toBe(points);
});
it('projects Direct Deposit and swaps only the authored conflicting group',()=>{
 profile();const sniper={soid:0x30000010en,defIndex:828};
 expect(mutateWeaponTalent(sniper,3)?.accepted).toBe(true);expect(weaponPerks(sniper)).toContain(171);
 const heavy={soid:0x300000402n,defIndex:840};
 for(const n of [0,1,2])expect(mutateWeaponTalent(heavy,n)?.accepted).toBe(true);
 expect(mutateWeaponTalent(heavy,6)?.accepted).toBe(false);
 expect(mutateWeaponTalent(heavy,6,true)?.accepted).toBe(true);
 const ranks=weaponTalentValue(heavy.soid,840)!.unknown4.unknown0;
 expect(ranks[2]).toBe(0);expect(ranks[6]).toBe(1);expect(ranks[0]).toBe(1);expect(ranks[1]).toBe(1);
 expect(weaponPerks(heavy)).not.toContain(166);
});
