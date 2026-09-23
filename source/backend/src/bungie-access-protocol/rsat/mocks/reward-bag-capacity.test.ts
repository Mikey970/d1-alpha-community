import {afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {stubSelfCharacter} from './values';import {inventoryWeapons,itemSoidForSlot} from './loadout';
let dir:string|undefined;afterEach(()=>{vi.unstubAllEnvs();if(dir)rmSync(dir,{recursive:true,force:true});});
it('keeps a full primary and delivered armor rewards inside their native bag ranges',()=>{
 dir=mkdtempSync(join(tmpdir(),'d1a-bag-'));const file=join(dir,'equipment.json');vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');vi.stubEnv('D1A_EQUIPMENT_PROFILE',file);
 const grants=Array.from({length:7},(_,i)=>({actorKey:`armor${i}`,packetId:i.toString(16).padStart(64,'0'),defIndex:104,soid:(0x300010000n+BigInt(i)).toString(16).padStart(16,'0'),delivered:true,awardedAt:'2026-09-07T00:00:00Z'}));
 writeFileSync(`${file}.repeat-rewards.json`,JSON.stringify({schema:1,grants}));
 const slots=stubSelfCharacter(0x1234n).unknown3!.unknown1!.unknown0;
 expect(slots[125]!.soid).toBe(itemSoidForSlot(8));expect(slots[75]!.soid).toBe(itemSoidForSlot(3));
 const primaries=inventoryWeapons().filter(i=>i.bucket===3);expect(primaries).toHaveLength(9);
 expect(slots.slice(115,125).map(i=>i.soid)).toEqual([itemSoidForSlot(7),...primaries.map(i=>i.soid)]);
 for(const g of grants)expect(slots.slice(65,75).some(i=>i.soid===BigInt(`0x${g.soid}`))).toBe(true);
 expect(slots[74]!.soid).toBe(0n);
});
