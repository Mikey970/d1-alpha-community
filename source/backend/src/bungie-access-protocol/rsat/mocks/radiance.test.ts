import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {decodeServerMessage,encodeServerMessage} from '@blamnetwork/rsat';
import {BungieAccessProtocolSession} from '../../session';
import {BapMessageType} from '../../constants';
import {TalentActivateRequest,TalentActivateResponse} from '../schemas/talent-requests';
import {Unknown808019AE} from '../../queuez/families/self';
import {equipInventoryProbe,equippedItemSoid,inventoryWeapons} from './loadout';
import {stubGearCf,stubSelfCharacter,stubInventoryItem} from './values';
import * as nova from './talent-state';
import * as radiance from './radiance-state';

afterEach(()=>{vi.unstubAllEnvs();nova.resetTalentStateForTests();radiance.resetTalentStateForTests();});
function setup(){
  vi.stubEnv('D1A_TALENT_PROBE','1');vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');vi.stubEnv('D1A_INVENTORY_CAPTURE_PATH','');
  const file=join(mkdtempSync(join(tmpdir(),'d1a-radiance-')),'talent.json');
  const saved={schema:2,itemSoid:'300000200',definition:442,grid:251,purchased:[1,21,15],version:3,
    testXp:21000,provenance:'client-801-with-explicit-test-progression'};
  writeFileSync(file,JSON.stringify(saved));vi.stubEnv('D1A_TALENT_STATE_PATH',file);
  return {file,saved};
}
it('owns both subclasses and restores identical Nova gear after independent Radiance selection',()=>{
  const {file,saved}=setup(),original=equippedItemSoid(1);
  try{
    expect(equipInventoryProbe(nova.TALENT_ITEM_SOID)).toBe(true);const before=stubGearCf();
    expect(before.unknown1.unknown0.map(r=>r.unknown0)).toEqual([41,12,22,7,20]);
    expect(inventoryWeapons().find(i=>i.soid===radiance.TALENT_ITEM_SOID)).toMatchObject({defIndex:441,artArrangement:-1,sandboxPattern:-1,slot:1});
    const bag=stubSelfCharacter(0xd1a0000000000001n).unknown3;
    expect(bag.unknown1.unknown0.some(i=>i.soid===radiance.TALENT_ITEM_SOID&&i.defIndex===441)).toBe(true);
    expect(stubInventoryItem(radiance.TALENT_ITEM_SOID,441).unknown4?.unknown0).toBe(250);
    expect(stubInventoryItem(nova.TALENT_ITEM_SOID,442).unknown4?.unknown0).toBe(251);
    for(const n of [1,19,25,15,10])expect(nova.activateTalentStep(radiance.TALENT_ITEM_SOID,n).accepted).toBe(true);
    expect(equipInventoryProbe(radiance.TALENT_ITEM_SOID)).toBe(true);
    const active=stubGearCf();
    expect(active.unknown1.unknown0.map(r=>r.unknown0)).toEqual([31,15,22,7,20]);
    expect(active.unknown1.unknown0[2].unknown1.unknown0).toEqual([0x8e2155ed,...Array(7).fill(0x811c9dc5)]);
    expect(active.unknown5!.unknown0).toEqual([50,96,97,98,95,...Array(21).fill(-1)]);
    expect(active.unknown3.unknown0.filter((_,i)=>i!==1)).toEqual(before.unknown3.unknown0.filter((_,i)=>i!==1));
    expect([active.unknown10,active.unknown11,active.unknown12]).toEqual([before.unknown10,before.unknown11,before.unknown12]);
    expect(stubSelfCharacter(0xd1a0000000000001n).unknown3).toEqual(bag);
    expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(saved);
    expect(JSON.parse(readFileSync(file+'.radiance.json','utf8'))).toMatchObject({definition:441,grid:250,purchased:[1,19,25,15,10]});
    radiance.resetTalentStateForTests();expect(radiance.talentAbilityRecords().map(r=>r.unknown0)).toEqual([31,15,22,7,20]);
    expect(equipInventoryProbe(nova.TALENT_ITEM_SOID)).toBe(true);expect(stubGearCf()).toEqual(before);
  }finally{equipInventoryProbe(original);}
});
it('handles native801 for the Radiance identity with a typed response and independent publication',()=>{
  setup();const socket=new EventEmitter(),logger={debug:vi.fn(),log:vi.fn(),warn:vi.fn(),error:vi.fn()};
  const session=new BungieAccessProtocolSession(socket as any,logger) as any,sent:any[]=[];
  session.send=(m:any)=>sent.push(m);session.inventorySubscriptions.set(4,0x100000001n);
  try{
    session.handleWorldServerRequest({msgType:BapMessageType.ClientToWorldServerRequest,sequence:9,
      body:encodeServerMessage(801,TalentActivateRequest,{itemSoid:radiance.TALENT_ITEM_SOID,nodeIndex:25})});
    const response=sent.find(m=>m.msgType===BapMessageType.ClientToWorldServerResponse);
    expect(decodeServerMessage(response.body,TalentActivateResponse).value.status.unknown0).toBe(0);
    expect(sent.some(m=>m.msgType===BapMessageType.QueuezToClientUpdateNotification)).toBe(true);
    expect(radiance.talentAbilityRecords().map(r=>r.unknown0)).toEqual([23,15,22,-1,20]);
    const state=radiance.talentValue();expect(decodeServerMessage(encodeServerMessage(801,Unknown808019AE,state),Unknown808019AE).value).toEqual(state);
    expect(nova.talentValue().unknown4!.unknown0[21]).toBe(1);
    expect(radiance.activateTalentStep(nova.TALENT_ITEM_SOID,25).accepted).toBe(false);
    expect(radiance.activateTalentStep(radiance.TALENT_ITEM_SOID,3).accepted).toBe(false);
    expect(radiance.activateTalentStep(radiance.TALENT_ITEM_SOID,0).accepted).toBe(true);
    expect(radiance.activateTalentStep(radiance.TALENT_ITEM_SOID,18).accepted).toBe(false);
    expect(radiance.swapTalentNode(radiance.TALENT_ITEM_SOID,18).accepted).toBe(false);
  }finally{socket.emit('close');}
});
