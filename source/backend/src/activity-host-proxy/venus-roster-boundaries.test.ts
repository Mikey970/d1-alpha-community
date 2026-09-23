import {expect,it} from 'vitest';
import {BitReader} from '@blamnetwork/rsat';
import {buildTowerApplySenseEntries} from './rsat/mocks/sensor-auth';
import {SquadAuth} from './rsat/schemas/sensor';
import templates from './venus-squad-counts.json';
it('matches native template lengths across Venus area loads, including the actual Engineering crash',()=>{
  let checked=0;
  for(let slice=0;slice<30;slice++){
    for(const entry of buildTowerApplySenseEntries(1n,slice,'venus_chapter_2')){
      if(entry.clientRef.typeId!==1||!entry.authBody)continue;
      const native=templates.find(r=>parseInt(r.bundle,16)===entry.clientRef.bundle&&r.squad===entry.clientRef.typeIndex);
      if(!native)continue;
      const auth=SquadAuth.decode(new BitReader(entry.authBody));
      if(!auth.roster)continue;
      expect(auth.roster.slots.length,`${slice}/${native.bundle}/${native.squad}`).toBe(native.memberCount);checked++;
    }
  }
  expect(checked).toBeGreaterThan(100);
  const crash=buildTowerApplySenseEntries(1n,7,'venus_chapter_2').filter(e=>e.clientRef.bundle===0x022112bb&&e.clientRef.typeId===1);
  expect(crash).toHaveLength(8);
  for(const e of crash)expect(SquadAuth.decode(new BitReader(e.authBody!)).roster.slots).toEqual([0,0]);
});
