/** Analysis only: correlate a real EAD kill with the unique authored Actor46.
 * ActorSense+11C is also placement failure/unlink, so it is never death evidence.
 * The integration must invalidate on unload, deletion, owner or binding change.
 */
import {decodeEadKill,isPlayerToAiKill} from './ead-kill-decoder';
import type {EadKill} from './ead-kill-decoder';
// r441 native Squad45 AI+24 and the player's actual boss EAD agree on this
// runtime class. The offline blueprint hash284A01A8 was not the spawned class.
export const NEXUS_WARDEN_CLASS=0x04d9ce0e;
export const STRIKE_KILL_BOSS=0x207c1b7a;
export type BossScope={runId:string;ahLifetime:string;generation:number;activityId:4;physicalBubble:28};
export type BossBinding={token:string;nativeGeneration:number;actor:46;bundle:0x0a302429};
export type BossKillProof={kind:'qualifiedRuinsBossKill';actorKey:string;packetId:string;
  classHash:number;lastPositiveHealth:number;healthAt:number;killAt:number;
  provenance:'actual_ead_kill_plus_unique_authored_boss_binding';wireVictimSquadIdentifier:null};
const same=(a:BossScope,b:BossScope)=>a.runId===b.runId&&a.ahLifetime===b.ahLifetime&&
  a.generation===b.generation&&a.activityId===b.activityId&&a.physicalBubble===b.physicalBubble;
export class RuinsBossKillGate {
  private binding?:BossBinding;
  private health?:{fraction:number;at:number;sequence:number};
  private consumed=new Set<string>();
  private completed=new Set<string>();
  readonly scope:BossScope;
  readonly player:{platformIdentity:string;characterId:string};
  constructor(scope:BossScope,player:{platformIdentity:string;characterId:string}) {
    if(!scope.runId||!scope.ahLifetime||scope.activityId!==4||scope.physicalBubble!==28||
      !Number.isSafeInteger(scope.generation)||scope.generation<0)throw Error('Invalid Ruins scope');
    this.scope={...scope};this.player={...player};
  }
  /** Issued census must identify exactly this one active boss instance; include
   * all loaded global/private populations and pending creations, not just guards.
   * Asset census proves no other normal Ruins squad uses284A01A8.
   */
  bind(binding:BossBinding,uniqueClassOwners:readonly string[]):void {
    if(!binding.token||binding.actor!==46||binding.bundle!==0x0a302429||
      !Number.isSafeInteger(binding.nativeGeneration)||binding.nativeGeneration<0||
      uniqueClassOwners.length!==1||uniqueClassOwners[0]!==binding.token)throw Error('Ambiguous boss lifetime');
    this.binding={...binding};this.health=undefined;
  }
  invalidate():void {this.binding=undefined;this.health=undefined;}
  /** Only decoded Health78 revision0 following matching bound Actor46 generation.
   * Zero, missing HP and a placement-failure flag cannot grant completion.
   */
  positiveHealth(scope:BossScope,binding:BossBinding,receipt:{fraction:number;revision:0;
    sequence:number;at:number;actorBound:boolean;loaded:boolean},now:number):void {
    if(!same(this.scope,scope)||!this.binding||binding.token!==this.binding.token||
      binding.nativeGeneration!==this.binding.nativeGeneration||binding.actor!==46||binding.bundle!==0x0a302429)return;
    if(!receipt.actorBound||!receipt.loaded){this.invalidate();return;}
    if(!Number.isFinite(now)||!Number.isFinite(receipt.at)||receipt.at>now||now-receipt.at>5000||
      receipt.revision!==0||!(receipt.fraction>0&&receipt.fraction<=1)||
      !Number.isSafeInteger(receipt.sequence)||receipt.sequence<0||receipt.sequence<=(this.health?.sequence??-1))return;
    this.health={fraction:receipt.fraction,at:receipt.at,sequence:receipt.sequence};
  }
  /** Production entry: the existing exact schema decoder validates the raw body. */
  receive(raw:Uint8Array,connectionKind:number,scope:BossScope,at:number,now:number):BossKillProof|null {
    try{return this.qualifyDecoded(decodeEadKill(raw,connectionKind),scope,at,now);}catch{return null;}
  }
  /** Separated for synthetic qualification tests. Production must call receive. */
  qualifyDecoded(event:EadKill,scope:BossScope,at:number,now:number):BossKillProof|null {
    const b=this.binding,h=this.health;
    if(!same(this.scope,scope)||!b||!h||!Number.isFinite(now)||!Number.isFinite(at)||at>now||
      now-at>5000||h.at>at||at-h.at>5000||event.schema!=='80804EAD'||
      !event.aliases.includes(0x324e9a20)||!isPlayerToAiKill(event,this.player)||
      event.victim.baseHash!==NEXUS_WARDEN_CLASS||event.victim.hash1!==STRIKE_KILL_BOSS||!/^[0-9a-f]{64}$/.test(event.eventId)||
      this.consumed.has(event.eventId))return null;
    const actorKey=`${b.token}/${b.nativeGeneration}`;
    if(this.completed.has(actorKey))return null;
    this.consumed.add(event.eventId);this.completed.add(actorKey);
    return {kind:'qualifiedRuinsBossKill',actorKey,packetId:event.eventId,classHash:NEXUS_WARDEN_CLASS,
      lastPositiveHealth:h.fraction,healthAt:h.at,killAt:at,
      provenance:'actual_ead_kill_plus_unique_authored_boss_binding',wireVictimSquadIdentifier:null};
  }
}
