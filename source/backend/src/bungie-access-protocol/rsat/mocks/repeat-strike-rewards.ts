import {characterSetting} from '../../character-context';
import {configuredCharacterClass} from './configured-character-class';
import {NATIVE_REWARD_CATALOG,rewardCatalogForClass} from './reward-catalog';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {chooseLoot} from './loot-balance';
import {NEXUS_WARDEN_CLASS} from '../../../activity-host-proxy/ruins-boss-kill-gate';
import type {BossKillProof} from '../../../activity-host-proxy/ruins-boss-kill-gate';

// Separate from the protected first-victory ledger and native equipment document.
// Authored fixed weapon tuples; the selection policy is local to this server.
export const REWARD_POOL = rewardCatalogForClass(configuredCharacterClass());
// Physical rows span ten indices per bucket. Preserve legal legacy ten-item
// journals; new drops retain the existing conservative nine-item limit.
const BUCKET_CAP=9;
const PHYSICAL_BUCKET_CAP=10;
let baseOccupancy:()=>Record<number,number>=()=>({3:10,4:8,5:4,8:2,9:2,10:2,11:2,12:2});
export function configureRepeatRewardBaseOccupancy(provider:()=>Record<number,number>){baseOccupancy=provider;}
type Grant={actorKey:string;packetId:string;defIndex:number;soid:string;delivered:boolean;awardedAt:string;retiredAt?:string};
type Journal={schema:1;version?:number;grants:Grant[]};
const path=()=>characterSetting('D1A_EQUIPMENT_PROFILE') ? `${characterSetting('D1A_EQUIPMENT_PROFILE')}.repeat-rewards.json` : undefined;
const poolItem=(defIndex:number)=>NATIVE_REWARD_CATALOG.find(i=>i.defIndex===defIndex);

function read():Journal {
  const p=path();if(!p||!existsSync(p))return {schema:1,version:0,grants:[]};
  const j=JSON.parse(readFileSync(p,'utf8')) as Journal;
  if(j.schema!==1||!Array.isArray(j.grants))throw Error('Invalid repeat reward journal');
  if(j.version!==undefined&&(!Number.isSafeInteger(j.version)||j.version<0))throw Error('Invalid repeat reward journal version');
  const actors=new Set<string>(),packets=new Set<string>(),ids=new Set<string>();
  const counts:Record<number,number>={...baseOccupancy()};
  for(const g of j.grants){
    const item=poolItem(g.defIndex);
    if(!item||!g.actorKey||!/^[0-9a-f]{64}$/.test(g.packetId)||!/^00000003[0-9a-f]{8}$/.test(g.soid)||
      BigInt(`0x${g.soid}`)<0x300010000n||typeof g.delivered!=='boolean'||!Number.isFinite(Date.parse(g.awardedAt))||
      (g.retiredAt!==undefined&&(g.delivered||!Number.isFinite(Date.parse(g.retiredAt))))||
      actors.has(g.actorKey)||packets.has(g.packetId)||ids.has(g.soid))throw Error('Invalid repeat reward entry');
    actors.add(g.actorKey);packets.add(g.packetId);ids.add(g.soid);
    if(g.delivered&&(counts[item.bucket]=(counts[item.bucket]??0)+1)>PHYSICAL_BUCKET_CAP)throw Error('Repeat reward inventory overflow');
  }
  // Older journals predate the explicit counter; their write count equalled the grant count.
  if(j.version===undefined)j.version=j.grants.length;
  return j;
}

function occupancy(j:Journal):Record<number,number> {
  const counts:Record<number,number>={...baseOccupancy()};
  for(const g of j.grants)if(g.delivered){const bucket=poolItem(g.defIndex)!.bucket;counts[bucket]=(counts[bucket]??0)+1;}
  return counts;
}

/** SOIDs the saved equipment document currently has equipped. Undefined when it cannot be
 *  read, in which case nothing is ever retired: an equipped item must never disappear from
 *  the allowed set, or EquipmentState refuses to load the profile at all. */
function equippedSoids():Set<string>|undefined {
  const p=characterSetting('D1A_EQUIPMENT_PROFILE');if(!p||!existsSync(p))return new Set<string>();
  try{
    const saved=JSON.parse(readFileSync(p,'utf8')) as {schema?:number;slots?:Record<string,string>;primarySoid?:string};
    const slots=saved.schema===1?{7:saved.primarySoid}:saved.slots;
    if(!slots)return undefined;
    return new Set(Object.values(slots).filter((v):v is string=>typeof v==='string'));
  }catch{return undefined;}
}

/** Deliver any held-back grant that now fits, oldest first. Never exceeds the bucket cap. */
function promote(j:Journal):Grant[] {
  const counts=occupancy(j),moved:Grant[]=[];
  for(const g of [...j.grants].sort((a,b)=>Date.parse(a.awardedAt)-Date.parse(b.awardedAt))){
    if(g.delivered)continue;
    const bucket=poolItem(g.defIndex)!.bucket;
    if(counts[bucket]>=BUCKET_CAP)continue;
    counts[bucket]++;g.delivered=true;delete g.retiredAt;moved.push(g);
  }
  return moved;
}

/** Make room in a full bucket by holding back its oldest delivered repeat reward. The grant
 *  record is kept, so promote() can hand the same item back when space frees; nothing is
 *  destroyed and the original loadout and first-victory reward are never touched. */
function retireOldest(j:Journal,bucket:number,equipped:Set<string>):Grant|undefined {
  const candidate=j.grants.filter(g=>g.delivered&&poolItem(g.defIndex)!.bucket===bucket&&!equipped.has(g.soid))
    .sort((a,b)=>Date.parse(a.awardedAt)-Date.parse(b.awardedAt))[0];
  if(!candidate)return;
  candidate.delivered=false;candidate.retiredAt=new Date().toISOString();
  return candidate;
}

function commit(j:Journal):void {
  const p=path();if(!p)throw Error('Repeat reward persistence path missing');
  j.version=(j.version??0)+1;
  writeFileSync(`${p}.tmp`,JSON.stringify(j,null,2)+'\n');renameSync(`${p}.tmp`,p);
}

export function repeatRewardItems(){return read().grants.filter(g=>g.delivered).map(g=>({...poolItem(g.defIndex)!,soid:BigInt(`0x${g.soid}`)}));}
export function repeatRewardVersion(){return read().version??0;}

/** Held-back grants and the free space per bucket, for honest reporting. Read-only. */
export function repeatRewardCapacity(){
  const j=read(),counts=occupancy(j);
  return {version:j.version??0,delivered:j.grants.filter(g=>g.delivered).length,
    held:j.grants.filter(g=>!g.delivered).length,
    free:Object.fromEntries(Object.entries(counts).map(([b,used])=>[b,Math.max(0,BUCKET_CAP-used)]))};
}

/** Deliver anything that now fits without awarding something new. Returns true when the
 *  inventory changed, so the caller can republish. */
export function promoteHeldRepeatRewards():boolean {
  const j=read(),moved=promote(j);
  if(!moved.length)return false;
  commit(j);
  for(const g of moved)console.log(`D1A_NEXUS_REPEAT_REWARD_PROMOTED ${JSON.stringify(g)}`);
  return true;
}

export function grantRepeatReward(proof:BossKillProof):boolean {
  if(proof.kind!=='qualifiedRuinsBossKill'||proof.provenance!=='actual_ead_kill_plus_unique_authored_boss_binding'||
    proof.classHash!==NEXUS_WARDEN_CLASS||!proof.actorKey||!(/^[0-9a-f]{64}$/).test(proof.packetId)||
    !(proof.lastPositiveHealth>0&&proof.lastPositiveHealth<=1)||!Number.isFinite(proof.healthAt)||
    !Number.isFinite(proof.killAt)||proof.killAt<proof.healthAt)throw Error('Unqualified repeat reward proof');
  return grantCatalogReward(proof.actorKey,proof.packetId);
}

/** Local ordinary-kill policy supplies its durable semantic fingerprint. */
export function grantIncidentCatalogReward(fingerprint:string):boolean {
  if(!/^[0-9a-f]{64}$/.test(fingerprint))throw Error('Invalid incident fingerprint');
  return grantCatalogReward(`ead/${fingerprint}`,fingerprint,
    chooseLoot('ordinary',parseInt(fingerprint.slice(8,16),16)/0x100000000,
      parseInt(fingerprint.slice(16,24),16)/0x100000000).defIndex);
}

function grantCatalogReward(actorKey:string,packetId:string,selection?:number):boolean {
  const p=path();if(!p)throw Error('Repeat reward persistence path missing');
  const j=read();
  if(j.grants.some(g=>g.actorKey===actorKey||g.packetId===packetId))return false;
  const promoted=promote(j);
  const equipped=equippedSoids();
  // Roll across the full eligible catalog even when its bucket is full: a
  // held grant is durable ownership, not a reroll that silently excludes primaries.
  const item=selection===undefined ? chooseLoot('boss',randomInt(0x100000000)/0x100000000,
    randomInt(0x100000000)/0x100000000) : rewardCatalogForClass(configuredCharacterClass()).find(item=>item.defIndex===selection)!;
  let counts=occupancy(j);
  let retired:Grant|undefined;
  if((counts[item.bucket]??0)>=BUCKET_CAP&&equipped){
    retired=retireOldest(j,item.bucket,equipped);
    counts=occupancy(j);
    // A legacy bucket can legally occupy ten rows. Do not hide an old item
    // when retiring just one still cannot deliver the new grant.
    if(retired&&(counts[item.bucket]??0)>=BUCKET_CAP){
      retired.delivered=true;delete retired.retiredAt;retired=undefined;
      counts=occupancy(j);
    }
  }
  const g:Grant={actorKey,packetId,defIndex:item.defIndex,
    soid:(0x300010000n+BigInt(j.grants.length)).toString(16).padStart(16,'0'),
    delivered:(counts[item.bucket]??0)<BUCKET_CAP,awardedAt:new Date().toISOString()};
  j.grants.push(g);
  commit(j);
  for(const moved of promoted)console.log(`D1A_NEXUS_REPEAT_REWARD_PROMOTED ${JSON.stringify(moved)}`);
  if(retired)console.log(`D1A_NEXUS_REPEAT_REWARD_HELD_BACK ${JSON.stringify(retired)}`);
  console.log(`${actorKey.startsWith('ead/')?'D1A_ORDINARY_CATALOG_REWARD':actorKey.startsWith('chapter2/')?'D1A_CHAPTER2_BOSS_REWARD':'D1A_NEXUS_REPEAT_REWARD'} ${JSON.stringify(g)}`);
  return true;
}

/** Separate Chapter2 proof; never masquerades as the Nexus class/EAD contract.
 * Caller has observed both live-to-terminal utility gates and the live-to-terminal
 * boss with paired zero-live squads. Uses the existing documented local boss loot policy. */
export function grantChapter2BossReward(proof:{activity:string;boss:number;gates:number[];packetId:string;actorKey:string}):boolean {
  if(proof.activity!=='venus_chapter_2'||proof.boss!==81||proof.gates.length!==2||
    ![129,131].every(g=>proof.gates.includes(g))||!/^chapter2\/[0-9a-f]+\/81$/.test(proof.actorKey)||
    !/^[0-9a-f]{64}$/.test(proof.packetId))throw Error('Unqualified Chapter2 boss reward');
  return grantCatalogReward(proof.actorKey,proof.packetId);
}
