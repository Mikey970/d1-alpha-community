import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeServerMessage,encodeServerMessage} from '@blamnetwork/rsat';
import {TalentActivateRequest} from '../schemas/talent-requests';
import {Unknown808019AE} from '../../queuez/families/self';
import {activateTalentStep,resetTalentStateForTests,swapTalentNode,TALENT_ITEM_SOID,
  talentValue,talentVersion,talentAbilityRecords,talentIntrinsicPerks} from './talent-state';

afterEach(()=>{vi.unstubAllEnvs();resetTalentStateForTests();});
function setup() {
  vi.stubEnv('D1A_TALENT_PROBE','1');
  const file=join(mkdtempSync(join(tmpdir(),'d1a-higher-nodes-')),'talent.json');
  const original={schema:2,itemSoid:'300000200',definition:442,grid:251,
    purchased:[1,21,15],version:3,testXp:21000,provenance:'client-801-with-explicit-test-progression'};
  writeFileSync(file,JSON.stringify(original));vi.stubEnv('D1A_TALENT_STATE_PATH',file);
  return {file,original};
}
it('upgrades legacy talent progression without losing purchases or modifying its file on read',()=>{
  const {file,original}=setup();
  expect(talentValue().unknown1.unknown1).toBe(49000);
  expect(talentVersion()).toBe(4);
  expect(talentAbilityRecords().map(r=>r.unknown0)).toEqual([41,12,22,7,20]);
  expect(talentIntrinsicPerks()).toEqual([96,97,98,95]);
  expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(original);
  for(const n of [2,11,12,22,23])expect(talentValue().unknown4!.unknown0[n]).toBe(0);
});
it('real801 codec selects modifier and perk without overwriting grenade or Nova binding',()=>{
  const {file}=setup();
  for(const nodeIndex of [11,22]) {
    const request=decodeServerMessage(encodeServerMessage(801,TalentActivateRequest,
      {itemSoid:TALENT_ITEM_SOID,nodeIndex}),TalentActivateRequest).value;
    expect(activateTalentStep(request.itemSoid,request.nodeIndex).accepted).toBe(true);
  }
  const abilities=talentAbilityRecords();
  expect(abilities.map(r=>r.unknown0)).toEqual([41,12,22,7,20]);
  expect(abilities[2].unknown1.unknown0).toEqual([0x68c8f859,...Array(7).fill(0x811c9dc5)]);
  expect(abilities[1].unknown1.unknown0).toEqual(Array(8).fill(0x811c9dc5));
  expect(talentIntrinsicPerks()).toEqual([51,96,97,98,95]);
  const state=talentValue();
  expect(decodeServerMessage(encodeServerMessage(801,Unknown808019AE,state),Unknown808019AE).value).toEqual(state);
  const saved=JSON.parse(readFileSync(file,'utf8'));
  expect(saved.purchased).toEqual([1,21,15,11,22]);expect(saved.testXp).toBe(49000);
  expect(activateTalentStep(TALENT_ITEM_SOID,11).changed).toBe(false);
  for(const n of [2,12,23,3,7,24])expect(activateTalentStep(TALENT_ITEM_SOID,n).accepted).toBe(false);
  expect(swapTalentNode(TALENT_ITEM_SOID,23).accepted).toBe(false);
  resetTalentStateForTests();expect(talentIntrinsicPerks()).toEqual([51,96,97,98,95]);
  expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(saved);
});
it('alternative first choice selects its own native perk',()=>{
  setup();expect(activateTalentStep(TALENT_ITEM_SOID,23).accepted).toBe(true);
  expect(talentIntrinsicPerks()).toEqual([49,96,97,98,95]);
  expect(talentAbilityRecords().map(r=>r.unknown0)).toEqual([41,12,22,7,20]);
});
