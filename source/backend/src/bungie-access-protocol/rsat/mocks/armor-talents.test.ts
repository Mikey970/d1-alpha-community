import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {armorTalentDefinition,mutateArmorTalent,armorTalentValue,armorStats} from './armor-talents';
import {equipInventoryProbe} from './loadout';import {stubGearCf} from './values';
let dir:string,file:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'d1a-armor-'));file=join(dir,'equipment.json');vi.stubEnv('D1A_EQUIPMENT_PROFILE',file);vi.stubEnv('D1A_ARMOR_TALENT_PROBE','1');vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');});
afterEach(()=>{for(let slot=2;slot<=6;slot++)equipInventoryProbe(0x300000001n+BigInt(slot));vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('authored armor upgrades with explicit local points',()=>{
 it('keeps authored random grants deterministic and selects one option, not their sum',()=>{
  const a=armorTalentDefinition(104)!;expect(a.initialPoints).toBe(0);expect(a.nodes[0]).toMatchObject({autoGrant:true,randomGrant:true,stepCount:9});
  const item={soid:0x300000420n,defIndex:104};const first=armorTalentValue(item.soid,item.defIndex)!;
  expect(first.unknown2).toBe(6);expect(first).toEqual(armorTalentValue(item.soid,item.defIndex));
  expect(first.unknown4.unknown0[0]).toBeGreaterThan(0);expect(first.unknown4.unknown0[0]).toBeLessThanOrEqual(9);
  // Node0 contains defense choices1..9; adding every rolled option would exceed9.
  const stats=armorStats([item],[]);expect(stats.find(([index])=>index===0)?.[1]).toBeLessThanOrEqual(9);
 });
 it('purchases a real stat upgrade, persists it, and changes equipped GearCF by exactly3',()=>{
  const item={soid:0x300000422n,defIndex:97};expect(equipInventoryProbe(item.soid)).toBe(true);
  const stat=(idx:number)=>stubGearCf().unknown9.unknown0.find(row=>row.unknown0===idx)?.unknown1??0;
  const before=stat(27);expect(mutateArmorTalent(item,10)).toMatchObject({accepted:true,changed:true});
  expect(stat(27)-before).toBe(3);expect(armorTalentValue(item.soid,item.defIndex)!.unknown2).toBe(5);
  const saved=JSON.parse(readFileSync(`${file}.armor-talents.json`,'utf8'));expect(saved.items['0000000300000422'].ranks[10]).toBe(1);
  expect(mutateArmorTalent(item,10)).toMatchObject({accepted:true,changed:false});
 });
 it('rejects unresolved effects and native grants, and uses802 for exclusive alternatives',()=>{
  const item={soid:0x300000422n,defIndex:97};expect(mutateArmorTalent(item,0)?.reason).toBe('armor-authored-grant-is-not-purchasable');
  expect(mutateArmorTalent({soid:0x300000424n,defIndex:101},2)?.reason).toBe('armor-native-effect-not-yet-recovered');
  expect(mutateArmorTalent(item,10)?.accepted).toBe(true);expect(mutateArmorTalent(item,11)?.reason).toBe('armor-group-use-swap');
  expect(mutateArmorTalent(item,11,true)?.accepted).toBe(true);const ranks=armorTalentValue(item.soid,item.defIndex)!.unknown4.unknown0;expect(ranks[10]).toBe(0);expect(ranks[11]).toBe(1);
 });
 it('projects authored wildcard modifiers into global hashes, preserving ability bindings',()=>{
  const item={soid:0x300000420n,defIndex:104};equipInventoryProbe(item.soid);const before=stubGearCf().unknown1;
  expect(mutateArmorTalent(item,1)?.accepted).toBe(true);expect(stubGearCf().unknown2.unknown0).toContain(0xfa20b9f9);expect(stubGearCf().unknown1).toEqual(before);
 });
 it('rejects malformed saved ranks without acknowledging a purchase',()=>{
  const item={soid:0x300000422n,defIndex:97};mutateArmorTalent(item,10);const p=`${file}.armor-talents.json`;const saved=JSON.parse(readFileSync(p,'utf8'));saved.items['0000000300000422'].ranks[0]=99;writeFileSync(p,JSON.stringify(saved));
  expect(mutateArmorTalent(item,11,true)).toMatchObject({accepted:false,changed:false});
 });
});
