import {characterSetting} from '../bungie-access-protocol/character-context';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {decodeEadKill,isPlayerToAiKill,type EadKill,type EadPlayerIdentity} from './ead-kill-decoder';
import {NEXUS_WARDEN_CLASS,STRIKE_KILL_BOSS} from './ruins-boss-kill-gate';
import {ordinaryLootChance} from '../bungie-access-protocol/rsat/mocks/loot-balance';
import {grantIncidentCatalogReward} from '../bungie-access-protocol/rsat/mocks/repeat-strike-rewards';
import {rewardEvents} from '../bungie-access-protocol/rsat/mocks/strike-rewards';
import {ORDINARY_LOOT_HOSTILES} from './ordinary-loot-hostiles';

// Unknown AI classes are intentionally not treated as enemies or NPCs by guess.
const HOSTILES=new Set<number>(ORDINARY_LOOT_HOSTILES.map(row=>row.hash));
const COMBAT=new Set(['venus_portal_1','venus_chapter_2','venus_bounty_1','action_mock']);
type Decision={drop:boolean};
type Journal={schema:1;decisions:Record<string,Decision>};

export function qualifiesOrdinaryKill(event:EadKill,player:EadPlayerIdentity|null):boolean {
  return player!==null&&event.aliases.includes(0x324e9a20)&&isPlayerToAiKill(event,player)&&
    event.victim.baseHash!==NEXUS_WARDEN_CLASS&&event.victim.hash1!==STRIKE_KILL_BOSS&&
    HOSTILES.has(event.victim.baseHash!);
}

/** Ignore transport aliases, retain complete decoded incident evidence. Identical
 * semantic kills are conservatively suppressed: EAD has no native kill serial. */
export function killFingerprint(event:EadKill):string {
  const {eventId:_,aliases:__,...incident}=event;
  return createHash('sha256').update(JSON.stringify(incident)).digest('hex');
}

/** Production caller is the live FAH Incident handler, never a sense/timer path. */
export function awardOrdinaryKill(raw:Uint8Array,scope:{activity:string;slice:number|undefined;connectionKind:number;player:EadPlayerIdentity|null}):boolean {
  if(scope.connectionKind!==0||!COMBAT.has(scope.activity)||scope.slice===undefined||scope.slice<0)return false;
  let event:EadKill;try{event=decodeEadKill(raw,scope.connectionKind);}catch{return false;}
  if(!qualifiesOrdinaryKill(event,scope.player))return false;
  const profile=characterSetting('D1A_EQUIPMENT_PROFILE');
  if(!profile)throw Error('Ordinary loot persistence path missing');
  const file=`${profile}.ordinary-loot.json`;
  const journal:Journal=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{schema:1,decisions:{}};
  if(journal.schema!==1||!journal.decisions||typeof journal.decisions!=='object'||Array.isArray(journal.decisions)||
    Object.entries(journal.decisions).some(([key,value])=>!/^[0-9a-f]{64}$/.test(key)||!value||typeof value.drop!=='boolean'))
    throw Error('Invalid ordinary loot journal');
  const fingerprint=killFingerprint(event);
  let decision=journal.decisions[fingerprint];
  if(!decision){
    decision={drop:parseInt(fingerprint.slice(0,8),16)/0x100000000<ordinaryLootChance()};
    journal.decisions[fingerprint]=decision;
    writeFileSync(`${file}.tmp`,JSON.stringify(journal)+'\n');renameSync(`${file}.tmp`,file);
  }
  // Retrying after a crash between decision and grant commits is safe: the shared
  // reward journal independently deduplicates this fingerprint before mutation.
  if(!decision.drop)return false;
  const granted=grantIncidentCatalogReward(fingerprint);
  if(granted)rewardEvents.emit('awarded');
  return granted;
}
