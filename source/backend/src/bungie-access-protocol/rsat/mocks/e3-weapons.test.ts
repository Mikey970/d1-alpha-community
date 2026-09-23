import {afterEach,expect,it,vi} from 'vitest';
import {encode,decode} from '@blamnetwork/rsat';
import rows from './e3-weapons.native.json';
import {PeerCharacter,SelfInventory} from '../../queuez';

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});

it('serializes all eight E3 weapon loadouts and preserves authored empty slots',async()=>{
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE','');
  vi.stubEnv('D1A_TALENT_STATE_PATH','');
  for(let preset=18;preset<=25;preset++){
    vi.stubEnv('D1A_E3_ABILITY_PRESET',String(preset));vi.resetModules();
    const loadout=await import('./loadout');
    const values=await import('./values');
    const selected=rows.filter(row=>row.preset===preset);
    const peer=decode(PeerCharacter,encode(PeerCharacter,values.stubPeerCharacter(0x300000001n)));
    const self=decode(SelfInventory,encode(SelfInventory,{unknown0:values.stubSelfCharacter(0x300000001n)}));
    const bags=self.unknown0!.unknown3!.unknown1!.unknown0;
    const occupied=bags.filter(item=>item.soid!==0n);
    expect(new Set(occupied.map(item=>item.soid)).size).toBe(occupied.length);
    for(const slot of [7,8,9]){
      const item=selected.find(row=>row.slot===slot);
      const gear=peer.unknown3!.unknown3!.unknown0[slot];
      const soid=item?BigInt(`0x${item.soid}`):0n;
      expect(loadout.equippedItemSoid(slot)).toBe(soid);
      expect(self.unknown0!.unknown4!.unknown0[slot]).toBe(soid);
      expect(gear).toMatchObject(item?{soid,defIndex:item.defIndex,unknown2:item.sandboxPattern,unknown3:item.artArrangement}:
        {soid:0n,defIndex:-1,unknown3:-1});
      if(item){
        expect(bags.filter(entry=>entry.soid===soid)).toHaveLength(1);
        expect(values.stubInventoryItem(soid,item.defIndex,slot).unknown4).toBeDefined();
      }
    }
    // Native inventory may equip another weapon, then restore the authored item.
    const special=selected.find(item=>item.slot===8)!;
    expect(loadout.equipInventoryProbe(0x300000401n)).toBe(true);
    expect(loadout.equippedItemSoid(8)).toBe(0x300000401n);
    expect(loadout.equipInventoryProbe(BigInt(`0x${special.soid}`))).toBe(true);
    expect(values.stubGearCf().unknown3.unknown0[8]).toMatchObject({defIndex:special.defIndex,unknown2:special.sandboxPattern});
  }
});

it('retains normal equipment defaults when no E3 preset is selected',async()=>{
  vi.stubEnv('D1A_E3_ABILITY_PRESET','');vi.stubEnv('D1A_EQUIPMENT_PROFILE','');
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');vi.resetModules();
  const loadout=await import('./loadout');
  expect(loadout.equippedItemSoid(9)).toBe(loadout.itemSoidForSlot(9));
  expect(loadout.inventoryWeapons().some(item=>item.defIndex>=983)).toBe(false);
});
