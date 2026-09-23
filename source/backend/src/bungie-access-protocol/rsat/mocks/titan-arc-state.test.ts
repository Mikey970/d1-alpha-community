import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as titan from "./titan-arc-state";
import {EquipmentState} from "./equipment-state";
import {inventoryWeapons,equipInventoryProbe,STUB_CHARACTER_CLASS} from "./loadout";
import {stubGearCf,stubInventoryItem} from "./values";
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'d1a-titan-'));vi.stubEnv('D1A_DIRECTOR_CHARACTER','titan-arc');vi.stubEnv('D1A_TALENT_PROBE','1');vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');vi.stubEnv('D1A_TALENT_STATE_PATH',join(dir,'talent.json'));titan.resetTalentStateForTests();});
afterEach(()=>{equipInventoryProbe(0x300000002n);for(let slot=2;slot<=6;slot++)equipInventoryProbe(0x300000001n+BigInt(slot));vi.unstubAllEnvs();titan.resetTalentStateForTests();rmSync(dir,{recursive:true,force:true});});
describe('Titan authored kit',()=>{
 it('persists Lift and Fist of Havoc and projects native ability4 through the equipped item',()=>{
  expect(STUB_CHARACTER_CLASS).toBe(1);
  expect(titan.activateTalentStep(titan.TALENT_ITEM_SOID,0).accepted).toBe(true);
  expect(titan.activateTalentStep(titan.TALENT_ITEM_SOID,25).accepted).toBe(true);
  titan.resetTalentStateForTests();
  expect(titan.talentAbilityRecords().map(r=>r.unknown0)).toEqual([23,4,8,10,20]);
  expect(equipInventoryProbe(titan.TALENT_ITEM_SOID)).toBe(true);
  expect(stubGearCf().unknown1.unknown0[1]!.unknown0).toBe(4);
  expect(stubInventoryItem(titan.TALENT_ITEM_SOID,434,1).unknown4?.unknown0).toBe(243);
  expect(stubGearCf().unknown3.unknown0[1]).toMatchObject({defIndex:434,unknown2:-1,unknown3:-1});
 });
 it('rejects foreign identities, locked nodes, and exclusive lift alternatives',()=>{
  expect(titan.activateTalentStep(0x300000202n,25).accepted).toBe(false);
  expect(titan.activateTalentStep(titan.TALENT_ITEM_SOID,49).accepted).toBe(false);
  expect(titan.activateTalentStep(titan.TALENT_ITEM_SOID,0).accepted).toBe(true);
  expect(titan.activateTalentStep(titan.TALENT_ITEM_SOID,18).accepted).toBe(false);
 });
 it('selects complete armor tuples and preserves ownership',()=>{
  const bag=inventoryWeapons().map(x=>x.soid);
  for(const [i,def] of [104,91,97,110,101].entries()){
   const soid=0x300000420n+BigInt(i);expect(equipInventoryProbe(soid)).toBe(true);
   expect(stubGearCf().unknown3.unknown0[i+2]).toMatchObject({soid,defIndex:def,unknown2:-1,unknown3:[99,86,92,105,96][i]});
  }
  expect(inventoryWeapons().map(x=>x.soid)).toEqual(bag);
 });
 it('reads legacy four-slot profile without rewriting and persists all nine on equip',()=>{
  const file=join(dir,'equipment.json');const saved={schema:2,version:36,slots:{1:'0000000300000202',7:'0000000300000008',8:'0000000300000009',9:'000000030000000a'}};writeFileSync(file,JSON.stringify(saved));
  const original=Object.fromEntries(Array.from({length:9},(_,i)=>[i+1,0x300000002n+BigInt(i)]));
  const allowed=[...Object.entries(original).map(([slot,soid])=>({slot:Number(slot),soid})),{slot:1,soid:0x300000202n},{slot:1,soid:titan.TALENT_ITEM_SOID}];
  const state=new EquipmentState(original,allowed,file);expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(saved);
  expect(state.equip(titan.TALENT_ITEM_SOID)).toBe(true);expect(Object.keys(JSON.parse(readFileSync(file,'utf8')).slots)).toHaveLength(9);
  expect(state.selectedForSlot(7)).toBe(0x300000008n);
 });
});
