import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
const choice=vi.hoisted(()=>({index:0}));
// Capacity tests select an exact tuple independently of the separately tested rarity policy.
vi.mock('./loot-balance',async()=>{const {rewardCatalogForClass}=await import('./reward-catalog');
 return {chooseLoot:()=>rewardCatalogForClass(1)[choice.index]};});
import {NATIVE_REWARD_CATALOG,rewardCatalogForClass} from './reward-catalog';
import {REWARD_POOL,configureRepeatRewardBaseOccupancy,grantRepeatReward,repeatRewardItems,repeatRewardCapacity,promoteHeldRepeatRewards} from './repeat-strike-rewards';
import {NEXUS_WARDEN_CLASS,type BossKillProof} from '../../../activity-host-proxy/ruins-boss-kill-gate';
let dir:string,file:string;
const proof=(n:number):BossKillProof=>({kind:'qualifiedRuinsBossKill',actorKey:`run:${n}`,packetId:n.toString(16).padStart(64,'0'),classHash:NEXUS_WARDEN_CLASS,lastPositiveHealth:0.5,healthAt:100,killAt:101,provenance:'actual_ead_kill_plus_unique_authored_boss_binding',wireVictimSquadIdentifier:null});
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'d1a-loot-'));file=join(dir,'equipment.json');vi.stubEnv('D1A_EQUIPMENT_PROFILE',file);configureRepeatRewardBaseOccupancy(()=>({3:1,4:1,5:1,8:1,9:1,10:1,11:1,12:1}));});
afterEach(()=>{vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('expanded native reward catalog',()=>{
 it('includes complete authored weapons and selected-class armor, without exotic placeholders',()=>{
  expect(NATIVE_REWARD_CATALOG).toHaveLength(651);expect(REWARD_POOL).toHaveLength(337);
  expect(REWARD_POOL.filter(i=>i.characterClass===0)).toHaveLength(180);
  expect(REWARD_POOL.every(i=>i.artArrangement>=0&&i.tier<=3)).toBe(true);
  expect(REWARD_POOL.some(i=>i.defIndex===104)).toBe(true);expect(REWARD_POOL.some(i=>i.defIndex===204)).toBe(false);
  expect(rewardCatalogForClass(2).some(i=>i.defIndex===204)).toBe(true);
  expect(REWARD_POOL.some(i=>[454,490,497,508,509].includes(i.defIndex))).toBe(false);
 });
 it('grants armor only from qualified distinct boss receipts and preserves the equipment document',()=>{
  choice.index=REWARD_POOL.findIndex(i=>i.defIndex===104);writeFileSync(file,JSON.stringify({schema:2,version:36,slots:{1:'0000000300000203'}}));const before=readFileSync(file,'utf8');
  expect(grantRepeatReward(proof(1))).toBe(true);expect(grantRepeatReward(proof(1))).toBe(false);
  expect(repeatRewardItems()[0]).toMatchObject({defIndex:104,artArrangement:99,bucket:8,slot:2});expect(readFileSync(file,'utf8')).toBe(before);
  expect(()=>grantRepeatReward({...proof(2),classHash:0})).toThrow('Unqualified');expect(repeatRewardItems()).toHaveLength(1);
 });
 it('keeps a full-bucket grant durable then promotes it without reroll or new award',()=>{
  choice.index=REWARD_POOL.findIndex(i=>i.defIndex===934);configureRepeatRewardBaseOccupancy(()=>({3:10,4:8,5:4,8:2,9:2,10:2,11:2,12:2}));
  expect(grantRepeatReward(proof(1))).toBe(true);expect(repeatRewardItems()).toHaveLength(0);expect(repeatRewardCapacity().held).toBe(1);
  configureRepeatRewardBaseOccupancy(()=>({3:8,4:8,5:4,8:2,9:2,10:2,11:2,12:2}));expect(promoteHeldRepeatRewards()).toBe(true);expect(repeatRewardItems()[0]?.defIndex).toBe(934);
  expect(grantRepeatReward(proof(1))).toBe(false);
 });
 it('reads legal legacy ten-row journals and never retires an equipped reward',()=>{
  choice.index=REWARD_POOL.findIndex(i=>i.defIndex===827);configureRepeatRewardBaseOccupancy(()=>({3:10,4:8,5:4,8:2,9:2,10:2,11:2,12:2}));
  const grants=[1,2].map((n)=>({actorKey:`old${n}`,packetId:n.toString(16).padStart(64,'0'),defIndex:827,soid:(0x300010000n+BigInt(n-1)).toString(16).padStart(16,'0'),delivered:true,awardedAt:'2026-09-07T00:00:00Z'}));
  writeFileSync(`${file}.repeat-rewards.json`,JSON.stringify({schema:1,grants}));writeFileSync(file,JSON.stringify({schema:2,slots:{8:grants[0]!.soid}}));
  expect(repeatRewardItems()).toHaveLength(2);expect(grantRepeatReward(proof(3))).toBe(true);
  expect(repeatRewardItems().some(i=>i.soid===BigInt(`0x${grants[0]!.soid}`))).toBe(true);expect(repeatRewardItems()).toHaveLength(2);
 });
});
it('grants Chapter2 boss loot once without accepting incomplete gates or a Nexus-shaped identity',async()=>{
 const {grantChapter2BossReward}=await import('./repeat-strike-rewards');
 const p={activity:'venus_chapter_2',boss:81,gates:[129,131],packetId:'f'.repeat(64),actorKey:'chapter2/1234/81'};
 expect(()=>grantChapter2BossReward({...p,gates:[129]})).toThrow('Unqualified');
 expect(grantChapter2BossReward(p)).toBe(true);expect(grantChapter2BossReward(p)).toBe(false);
 expect(repeatRewardItems()).toHaveLength(1);
});
