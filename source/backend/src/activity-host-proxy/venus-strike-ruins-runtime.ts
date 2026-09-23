import {createLaterStrike,type LaterEvent,type LaterEffect,GLOBAL,MINION_POPULATIONS} from './strike-later-controller';
import {RuinsSenseAdapter,GUARDS,MINIONS} from './ruins-health-adapter';
import {decodeStrikeSense} from './ruins-sense';
import {RuinsBossKillGate,type BossBinding,type BossScope} from './ruins-boss-kill-gate';
import * as auth from './venus-strike-ruins-auth';
import type {SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import type {EadPlayerIdentity} from './ead-kill-decoder';
export type RuinsOutput={kind:'auth';entries:SensorAuthSenseEntry[]}|{kind:'blocked';effect:string;reason:string}|{kind:'bossKillEvidence';evidence:unknown}|{kind:'dialogue';cue:'d010'|'d040'};
/** Native route/receipt adapter. Cleanup and Lifetime6 are client-consumer proven;
 * the host Lua producers and actual Ruins gameplay remain unaccepted. */
export class VenusStrikeRuinsRuntime {
  private armed=false;private requested=false;private refreshed=false;private registry=false;
  private stopped=false;private ready=false;private occupied:number|undefined;
  private seen=new Set<string>();private retained=new Map<string,SensorAuthSenseEntry>();
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private cacheTimer:ReturnType<typeof setTimeout>|undefined;private cacheGeneration=0;
  private adapter:RuinsSenseAdapter;private gate:RuinsBossKillGate;private bossBinding?:BossBinding;
  private bossRequested=false;private actorBound=false;private sequence=0;
  private pendingDrop?:{token:number;actor:number;squad:number;pendingSeen:boolean;completed:boolean;generation:number};
  private stormGeneration=new Map<number,number>();private wavesBlocked=false;
  private actorReceipts=new Map<number,{sequence:number;generation?:number}>();
  private squadSequences=new Map<number,number>();private allocations=new Map<number,number>();
  private cleanupActors=new Map<number,{generation:number;sequence:number}>();
  private cleanupSquads=new Map<number,number>();
  private deferredDrop?:Extract<LaterEffect,{kind:'dropSquad'}>;
  private endRequested=false;private endSent=false;
  private rejectedPacketShapes=new Set<string>();
  private queue:LaterEffect[]=[];private draining=false;
  private readonly scope:BossScope;
  constructor(private readonly lifetime:string,private readonly emit:(output:RuinsOutput)=>void,
    private readonly log:(s:string)=>void,player:EadPlayerIdentity){
    this.scope={runId:lifetime,ahLifetime:lifetime,generation:1,activityId:4,physicalBubble:28};
    this.adapter=new RuinsSenseAdapter(createLaterStrike(lifetime,1));
    this.gate=new RuinsBossKillGate(this.scope,player);
  }
  arm(activity:string,actualDigSiteArrival:boolean){if(activity==='venus_portal_1'&&actualDigSiteArrival&&!this.stopped)this.armed=true;}
  request(activity:string,occupied:number|undefined,destination:number|undefined){
    if(this.armed&&!this.stopped&&activity==='venus_portal_1'&&occupied===5&&destination===28)this.requested=true;
  }
  cancel(){if(!this.refreshed)this.requested=false;}
  occupiedRefresh(activity:string,previous:number|undefined,hinted:number|undefined){
    if(this.stopped)return;
    if(hinted!==undefined)this.occupied=hinted;
    if(this.refreshed&&hinted!==undefined&&hinted!==28){this.stop();return;}
    if(!this.refreshed&&this.armed&&this.requested&&activity==='venus_portal_1'&&previous===5&&hinted===28)this.refreshed=true;
  }
  registrySent(activity:string,occupied:number|undefined){
    if(!this.stopped&&this.refreshed&&activity==='venus_portal_1'&&occupied===28)this.registry=true;
  }
  get state(){return this.adapter.state;}
  refreshState(occupied:number):auth.RuinsRetainedAuth|undefined{
    if(this.stopped||!this.ready||occupied!==28)return;
    return {managedKeys:[...this.retained.keys()],authEntries:[...this.retained.values()]};
  }
  stop(){this.stopped=true;this.gate.invalidate();for(const t of this.timers)clearTimeout(t);this.timers.clear();this.queue=[];}
  private send(entries:SensorAuthSenseEntry[]){
    if(this.stopped||!this.ready||this.occupied!==28)return;
    for(const e of entries){const r=e.clientRef,key=`${r.bundle}/${r.typeId}/${r.typeIndex}`;
      // Keep exact last Auth but never replay an initial Sense or reset its sequence.
      const {senseBody,senseBits,senseStateSequence,...rest}=e;
      this.retained.set(key,{...rest,isReceivedSenseState:false,isSenseUpdateRelative:true});}
    this.emit({kind:'auth',entries});
  }
  private block(effect:string,reason:string){this.emit({kind:'blocked',effect,reason});}
  private stamp(now:number){return {...this.scope,bundle:GLOBAL,observedAt:now,sequence:++this.sequence,bound:true,loaded:true};}
  private control(e:Record<string,unknown>,now=Date.now()){
    this.apply(this.adapter.control({...e,...this.stamp(now)} as unknown as LaterEvent,now));
  }
  private schedule(ms:number,fn:()=>void){const timer=setTimeout(()=>{this.timers.delete(timer);if(!this.stopped&&this.occupied===28)fn();},ms);this.timers.add(timer);return timer;}
  observe(payload:Buffer,activity:string,occupied:number|undefined){
    if(this.stopped||!this.registry||activity!=='venus_portal_1'||occupied!==28)return;
    const now=Date.now(),packet=decodeStrikeSense(payload);if(!packet){
      // A new coalesced native field must be decoded from evidence, not skipped.
      const shape=`${payload.length}/${payload.subarray(0,12).toString('hex')}`;
      if(this.rejectedPacketShapes.size<4&&!this.rejectedPacketShapes.has(shape)){
        this.rejectedPacketShapes.add(shape);this.log(`D1A_STRIKE_RUINS_RECEIPT_UNSUPPORTED bytes=${payload.length} complete=${payload.length<=4096} payload=${payload.subarray(0,4096).toString('hex')}`);}
      return;}
    if(!this.ready){
      for(const r of packet.rows)if(r.bundle===0x9cf47ad5&&r.sequence>=1&&
        ((r.type===3&&r.index===0)||(r.type===1&&r.index>=1&&r.index<=4)))this.seen.add(`${r.type}/${r.index}`);
      if(!['3/0','1/1','1/2','1/3','1/4'].every(k=>this.seen.has(k)))return;
      this.ready=true;
      // These two state facts are earned by the upstream actual Trigger75 arrival,
      // not new synthesized trigger receipts. This module owns only the Ruins half.
      this.adapter.state={...this.adapter.state,phase:'digSite',digArrived:true};
      this.log(`D1A_STRIKE_RUINS_OWNER_READY ${this.lifetime}; private4Squads+Objective0; rendering unproven`);
      this.send([auth.ruinsObjectiveTasks(false,true),...MINIONS.map(s=>auth.ruinsSquad(s,0,true)),
        ...[79,80,81].map(auth.ruinsMonitor)]);
      for(const s of MINIONS){this.adapter.bindSquad(s,`${this.lifetime}/squad${s}`,[0]);this.allocations.set(s,0);}
      this.control({kind:'enterRuins',physicalBubble:28},now);
      return; // Registry receipts predate newly issued allocations.
    }
    for(const r of packet.rows){
      if(r.bundle!==GLOBAL)continue;
      if(r.type===1){const previous=this.squadSequences.get(r.index)??-1;
        if(r.sequence>previous)this.squadSequences.set(r.index,r.sequence);
        const floor=this.cleanupSquads.get(r.index);
        // Removal is acknowledged only by a new valid native zero-count receipt.
        // Its retirement vector is never converted into a combat kill event.
        if(floor!==undefined&&r.sequence>floor&&r.valid&&r.currentCohortCount===0&&r.retirementRoster?.length===1)
          this.cleanupSquads.delete(r.index);
      }
      if(r.type===2&&[40,42,44].includes(r.index)){
        const old=this.actorReceipts.get(r.index);if(old&&r.sequence<=old.sequence)continue;
        const generation=r.generation??old?.generation;
        this.actorReceipts.set(r.index,{sequence:r.sequence,generation});
        const pending=this.cleanupActors.get(r.index);
        if(pending&&generation===pending.generation&&r.sequence>pending.sequence&&r.bound===false&&r.terminal===false&&r.dropPending===0){
          this.cleanupActors.delete(r.index);this.log(`D1A_STRIKE_RUINS_STORM_REMOVED actor=${r.index} generation=${generation} sequence=${r.sequence}`);}
      }
    }
    this.flushDeferred();
    for(const r of packet.rows){
      if(r.bundle!==GLOBAL||r.type!==2||r.index!==46||!this.bossRequested)continue;
      if(!this.bossBinding&&r.generation===1&&r.bound===true&&!r.terminal){
        this.bossBinding={token:`${this.lifetime}/boss46`,nativeGeneration:r.generation,actor:46,bundle:GLOBAL};
        this.adapter.bindBoss(this.bossBinding.token,r.generation,r.sequence-1);
        this.gate.bind(this.bossBinding,[this.bossBinding.token]); // Only authored Actor46 class284A01A8 issued.
      }
      if(r.generation!==undefined&&this.bossBinding&&r.generation!==this.bossBinding.nativeGeneration){this.gate.invalidate();this.bossBinding=undefined;}
      this.actorBound=r.bound===true&&!r.terminal;
    }
    const scope={...this.scope,observedAt:now,bound:true,loaded:true};
    const effects=this.adapter.observe(payload,scope,now);
    if(this.bossBinding)for(const r of packet.rows)if(r.bundle===GLOBAL&&r.type===19&&r.index===78&&r.health!==undefined&&r.health>0&&r.healthRevision===0)
      this.gate.positiveHealth(this.scope,this.bossBinding,{fraction:r.health,revision:0,sequence:r.sequence,at:now,actorBound:this.actorBound,loaded:true},now);
    this.apply(effects);
    this.flushDeferred();
    const p=this.pendingDrop;
    if(p&&!this.wavesBlocked){
      for(const r of packet.rows)if(r.bundle===GLOBAL&&r.type===2&&r.index===p.actor&&r.dropSequence===p.token&&this.actorReceipts.get(p.actor)?.generation===p.generation){
        if(r.terminal){this.wavesBlocked=true;this.block('dropSquad','Native storm failed/unlinked; no completion');break;}
        if(r.dropPending===1)p.pendingSeen=true;
        if(r.dropPending===0&&p.pendingSeen)p.completed=true;
      }
      const spawned=this.adapter.nativePopulation(p.squad,now);
      if(p.completed&&spawned&&spawned.currentCohortCount>0){this.pendingDrop=undefined;
        this.control({kind:'dropComplete',token:p.token,accepted:true,pendingWasSeen:true,nativeComplete:true,spawnObserved:true},now);}
    }
  }
  incident(payload:Buffer,activity:string,occupied:number|undefined){
    if(this.stopped||!this.ready||activity!=='venus_portal_1'||occupied!==28||this.adapter.state.phase!=='boss')return;
    const now=Date.now(),proof=this.gate.receive(payload,0,this.scope,now,now);if(!proof)return;
    this.emit({kind:'bossKillEvidence',evidence:proof});this.apply(this.adapter.acceptQualifiedBossKill(proof,now));
  }
  private flushDeferred(){
    if(this.endRequested&&!this.endSent&&!this.cleanupActors.size&&!this.cleanupSquads.size){
      this.endSent=true;this.send([auth.ruinsHud(71,true)]);
      // Keep the completed arena available for inventory/rewards. Lifetime6
      // currently returns into retained-activity autolaunch; do not force it.
      this.log('D1A_STRIKE_RUINS_VICTORY_HOLD cleanup=acknowledged automaticExit=false; native terminal handoff deferred');
    }
    if(this.deferredDrop&&!this.draining&&!this.wavesBlocked&&!this.cleanupActors.size&&this.state.phase==='boss'&&
      (this.adapter.nativePopulation(this.deferredDrop.squad,Date.now())||this.adapter.initialZeroSeen(this.deferredDrop.squad))){
      const e=this.deferredDrop;this.deferredDrop=undefined;this.apply([e]);}
  }
  private apply(effects:LaterEffect[]){
    this.queue.push(...effects);if(this.draining)return;this.draining=true;
    try{while(this.queue.length&&!this.stopped){const e=this.queue.shift()!;
      switch(e.kind){
        case 'placeSquad':{
          if(e.bundle!==GLOBAL||!GUARDS.includes(e.squad as never)){this.block(e.kind,'Not a Ruins guard allocation');break;}
          this.send([auth.ruinsSquad(e.squad,1,true)]);this.adapter.bindSquad(e.squad,`${this.lifetime}/squad${e.squad}`,[1]);break;}
        case 'dialogue':this.emit(e);this.log(`D1A_STRIKE_RUINS_DIALOGUE_${e.cue}_COMPLETION_RECEIPT_UNAVAILABLE`);this.control({kind:'dialogue',cue:e.cue,resolution:'unavailable'});break;
        case 'objectiveBegin':case 'objectiveEnd':
          if(e.sensor===66||e.sensor===71)this.send([auth.ruinsHud(e.sensor,e.kind==='objectiveBegin',e.sensor===66&&this.adapter.state.boss?.dead?1:0)]);break;
        case 'navEnable':case 'navDisable':break; // Exact Nav151 is carried in active PlayerObjective66 slots.
        case 'guardTimeout':this.schedule(e.delayMs,()=>this.control({kind:'guardTimeout'}));break;
        case 'authoredDelay':this.schedule(e.delayMs,()=>this.control({kind:'delayElapsed',token:e.token}));break;
        case 'placeDirectBoss':this.bossRequested=true;this.send([auth.ruinsObjectiveTasks(true),auth.ruinsSquad(45,0,true),auth.ruinsActor(46,1),auth.ruinsHealth()]);break;
        case 'dropSquad':{
          if(this.wavesBlocked){this.block(e.kind,'Native storm failed; no further drop');break;}
          if(this.cleanupActors.size){this.deferredDrop=e;break;}
          const prior=this.adapter.nativePopulation(e.squad,Date.now());
          if(!prior&&!this.adapter.initialZeroSeen(e.squad)){
            this.deferredDrop=e;this.log(`D1A_STRIKE_RUINS_REFILL_WAIT squad=${e.squad}; fresh complete native roster required`);break;}
          // Native deficit=max(A-C-R,0). At this authored respawn call only, fill
          // missing members: Anew=max(Aprevious,Rlatest+P), never reset survivors.
          const allocation=Math.max(prior?.allocation[0]??0,(prior?.retirementRoster[0]??0)+e.population[0]);
          const generation=(this.stormGeneration.get(e.stormActor)??0)+1;this.stormGeneration.set(e.stormActor,generation);
          this.pendingDrop={token:e.token,actor:e.stormActor,squad:e.squad,pendingSeen:false,completed:false,generation};
          this.send([auth.ruinsSquad(e.squad,allocation,false),...(generation===1?[auth.ruinsStormSquad(e.stormActor)]:[]),auth.ruinsActor(e.stormActor,generation),auth.ruinsDrop(e.stormActor,e.squad,e.token,generation)]);
          this.adapter.bindSquad(e.squad,`${this.lifetime}/squad${e.squad}`,[allocation]);this.allocations.set(e.squad,allocation);break;}
        case 'removeStorm':{
          const generation=this.stormGeneration.get(e.actor);if(generation===undefined)break;
          if(this.cleanupActors.has(e.actor))break;
          this.cleanupActors.set(e.actor,{generation,sequence:this.actorReceipts.get(e.actor)?.sequence??-1});
          this.send([auth.ruinsActor(e.actor,generation,false)]);break;}
        case 'removeMinions':{
          this.deferredDrop=undefined;this.pendingDrop=undefined;
          for(const squad of e.squads)if((this.allocations.get(squad)??0)>0){
            const prior=this.adapter.nativePopulation(squad,Date.now());
            // Already-empty, fresh and fully reconciled is actual native proof;
            // requesting zero again need not produce a new unchanged Sense delta.
            if(!prior||prior.currentCohortCount!==0)
              this.cleanupSquads.set(squad,this.squadSequences.get(squad)??-1);
            this.send([auth.ruinsSquad(squad,0,false)]);this.allocations.set(squad,0);}
          break;}
        case 'bossDefeated':this.send([auth.ruinsHud(66,true,1)]);break;
        case 'ammoCacheCycle':{
          if(this.cacheTimer){clearTimeout(this.cacheTimer);this.timers.delete(this.cacheTimer);this.cacheTimer=undefined;}
          if(!e.active){if(this.cacheGeneration)this.send(e.objects.map(n=>auth.ruinsCache(n,this.cacheGeneration,false)));break;}
          const cycle=()=>{if(this.cacheGeneration)this.send(e.objects.map(n=>auth.ruinsCache(n,this.cacheGeneration,false)));
            this.cacheGeneration++;this.send(e.objects.map(n=>auth.ruinsCache(n,this.cacheGeneration,true)));
            this.cacheTimer=this.schedule(e.periodMs,cycle);};cycle();break;}
        case 'nativeActivityEnd':this.endRequested=true;this.flushDeferred();break;
        case 'phaseComplete':this.log('D1A_STRIKE_RUINS_AUTHORED_SEQUENCE_ENDED; native Orbit and rewards require runtime evidence');break;
        default:this.block(e.kind,'Unsupported Ruins effect');
      }
    }}finally{this.draining=false;}
  }
}
