import {characterSetting} from '../../character-context';
import {grantRepeatReward,repeatRewardVersion} from './repeat-strike-rewards';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import type {BossKillProof} from '../../../activity-host-proxy/ruins-boss-kill-gate';

// Local recovery-server reward policy, not a recovered Bungie drop table.
// One actual Nexus victory unlocks this authored Superior item permanently.
export const rewardEvents=new EventEmitter();
const file=()=>characterSetting('D1A_EQUIPMENT_PROFILE') ? `${characterSetting('D1A_EQUIPMENT_PROFILE')}.strike-rewards.json` : undefined;
type Ledger={schema:1;reward:'nexus-superior-836';packetId:string;actorKey:string;classHash:number;version:1;awardedAt:string};
function ledger():Ledger|undefined {
  const p=file();if(!p||!existsSync(p))return;
  const value=JSON.parse(readFileSync(p,'utf8')) as Ledger;
  if(value.schema!==1||value.reward!=='nexus-superior-836'||value.classHash!==0x04d9ce0e||
    !/^[0-9a-f]{64}$/.test(value.packetId)||!value.actorKey||value.version!==1)throw Error('Invalid strike reward ledger');
  return value;
}
export function strikeRewardOwned(){return !!ledger();}
export function strikeRewardVersion(){return (ledger()?.version??0)+repeatRewardVersion();}
export function awardNexusVictory(proof:BossKillProof):boolean {
  const p=file();if(!p)throw Error('Reward persistence path missing');
  if(proof.kind!=='qualifiedRuinsBossKill'||proof.classHash!==0x04d9ce0e||
    proof.provenance!=='actual_ead_kill_plus_unique_authored_boss_binding'||
    !/^[0-9a-f]{64}$/.test(proof.packetId)||!proof.actorKey||!(proof.lastPositiveHealth>0&&proof.lastPositiveHealth<=1))
    throw Error('Unqualified Nexus reward');
  const first=ledger();
  if(first){
    if(first.actorKey===proof.actorKey||first.packetId===proof.packetId)return false;
    const granted=grantRepeatReward(proof);if(granted)rewardEvents.emit('awarded');return granted;
  }
  const entry:Ledger={schema:1,reward:'nexus-superior-836',packetId:proof.packetId,actorKey:proof.actorKey,
    classHash:proof.classHash,version:1,awardedAt:new Date().toISOString()};
  writeFileSync(`${p}.tmp`,JSON.stringify(entry,null,2)+'\n','utf8');renameSync(`${p}.tmp`,p);
  rewardEvents.emit('awarded');return true;
}
