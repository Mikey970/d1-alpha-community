import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync,mkdtempSync,rmSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {awardOrdinaryKill,killFingerprint,qualifiesOrdinaryKill} from './ordinary-kill-loot';
import {decodeEadKill,eadPlayerIdentity} from './ead-kill-decoder';
import {repeatRewardCapacity,repeatRewardItems} from '../bungie-access-protocol/rsat/mocks/repeat-strike-rewards';
import {chooseLoot,ordinaryLootChance} from '../bungie-access-protocol/rsat/mocks/loot-balance';

const fixture=(name:string)=>Buffer.from(readFileSync(join(__dirname,'strike-fixtures',name),'utf8').trim(),'hex');
const kill=fixture('r421-rocket-kill-175.hex');
const player=eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!;
const scope={activity:'venus_portal_1',slice:7,connectionKind:0,player};
let dir:string|undefined;
afterEach(()=>{vi.unstubAllEnvs();if(dir)rmSync(dir,{recursive:true,force:true});dir=undefined;});
function profile(chance:string){dir=mkdtempSync(join(tmpdir(),'d1a-loot-'));const file=join(dir,'equipment.json');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE',file);vi.stubEnv('D1A_ORDINARY_LOOT_CHANCE',chance);return file;}

it('persists one actual attributed hostile kill, preserves inventory and suppresses replay after reload',()=>{
  const file=profile('1');writeFileSync(file,JSON.stringify({schema:2,slots:{7:'0000000300000100'}}));
  const saved=readFileSync(file,'utf8');
  expect(decodeEadKill(kill,0).victim.baseHash).toBe(0x54cfab9c);
  expect(awardOrdinaryKill(kill,scope)).toBe(true);
  const journal=readFileSync(`${file}.repeat-rewards.json`,'utf8');
  expect(awardOrdinaryKill(kill,scope)).toBe(false);
  expect(readFileSync(`${file}.repeat-rewards.json`,'utf8')).toBe(journal);
  expect(readFileSync(file,'utf8')).toBe(saved);
  expect(repeatRewardCapacity().delivered+repeatRewardCapacity().held).toBe(1);
  expect(repeatRewardItems().length).toBeLessThanOrEqual(1);
});
it('persists a nondrop and cannot reroll it by changing chance or alias envelope',()=>{
  const file=profile('0');expect(awardOrdinaryKill(kill,scope)).toBe(false);
  vi.stubEnv('D1A_ORDINARY_LOOT_CHANCE','1');expect(awardOrdinaryKill(kill,scope)).toBe(false);
  expect(existsSync(`${file}.repeat-rewards.json`)).toBe(false);
  const event=decodeEadKill(kill,0);
  expect(killFingerprint({...event,aliases:[...event.aliases,123],eventId:'f'.repeat(64)})).toBe(killFingerprint(event));
});
it('rejects own death, malformed incidents, wrong kind, unloaded and noncombat activities',()=>{
  const file=profile('1');
  for(const raw of [fixture('r421-guardian-death-175.hex'),kill.subarray(0,10),Buffer.from([0])])
    expect(awardOrdinaryKill(raw,scope)).toBe(false);
  for(const activity of ['city_tower_default1','ambient_city_tower','pvp_factory','pvp_greenhouse','pvp_marsbattle','orbit','unknown'])
    expect(awardOrdinaryKill(kill,{...scope,activity})).toBe(false);
  expect(awardOrdinaryKill(kill,{...scope,connectionKind:1})).toBe(false);
  expect(awardOrdinaryKill(kill,{...scope,slice:undefined})).toBe(false);
  expect(existsSync(`${file}.ordinary-loot.json`)).toBe(false);
});
it('has explicit deterministic tier boundaries independent of catalogue tier sizes',()=>{
  expect(ordinaryLootChance(undefined)).toBe(.04);
  for(const [mode,roll,tier] of [['ordinary',0,1],['ordinary',.74999,1],['ordinary',.75,2],
    ['ordinary',.97999,2],['ordinary',.98,3],['boss',.09999,1],['boss',.1,2],['boss',.84999,2],['boss',.85,3]] as const)
    expect(chooseLoot(mode,roll,.5).tier).toBe(tier);
  expect(()=>chooseLoot('ordinary',1,0)).toThrow();expect(()=>ordinaryLootChance('1.1')).toThrow();
});
it('reserves Nexus packets and rejects unknown AI/NPC classes and other players',()=>{
  const event=decodeEadKill(kill,0);
  for(const victim of [{...event.victim,baseHash:0x04d9ce0e},{...event.victim,hash1:0x207c1b7a},
    {...event.victim,baseHash:123},{...event.victim,characterId:PLAYER_ID}])
    expect(qualifiesOrdinaryKill({...event,victim},player)).toBe(false);
  expect(qualifiesOrdinaryKill({...event,attacker:{...event.attacker,characterId:'0000000000000001'}},player)).toBe(false);
});
it('qualifies authored Vex combat classes but never the authored or observed Nexus class',()=>{
  const event=decodeEadKill(kill,0);
  // Synthetic decoded variants exercise classification; this is not a captured Vex kill.
  for(const baseHash of [0x0e99eecc,0x6cf5473d,0x661ad563,0x424e0f82])
    expect(qualifiesOrdinaryKill({...event,victim:{...event.victim,baseHash}},player)).toBe(true);
  for(const baseHash of [0x284a01a8,0x04d9ce0e])
    expect(qualifiesOrdinaryKill({...event,victim:{...event.victim,baseHash}},player)).toBe(false);
});
const PLAYER_ID='d1a0000000000001';

it('requires the joined character and host identity, never another save or a missing join',()=>{
  const file=profile('1');
  const titan=eadPlayerIdentity(0x200000003n,0xd1a0000000000001n)!;
  const anotherHost=eadPlayerIdentity(0x200000002n,0xd1a0000000000002n)!;
  expect(qualifiesOrdinaryKill(decodeEadKill(kill,0),player)).toBe(true);
  for(const owner of [titan,anotherHost,null]) {
    expect(awardOrdinaryKill(kill,{...scope,player:owner})).toBe(false);
  }
  expect(existsSync(`${file}.ordinary-loot.json`)).toBe(false);
  // Synthetic decoded identity variant: classifier coverage, not a native Titan kill.
  const event=decodeEadKill(kill,0);
  const titanKill={...event,attacker:{...event.attacker,...titan}};
  expect(qualifiesOrdinaryKill(titanKill,titan)).toBe(true);
  expect(qualifiesOrdinaryKill(titanKill,player)).toBe(false);
  expect(eadPlayerIdentity(undefined,0xd1a0000000000001n)).toBeNull();
  expect(eadPlayerIdentity(0n,0xd1a0000000000001n)).toBeNull();
  expect(eadPlayerIdentity(0x200000003n,0n)).toBeNull();
});
