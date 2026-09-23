import {ServitorTargetBatchDraft, type TargetBatchEvidence} from './servitor-target-batch';
import {decodeEadKill, isPlayerToAiKill, type EadPlayerIdentity} from './ead-kill-decoder';
// Re-certify if adding any positive allocation outside the authored Engineering
// program. The audit includes all nonzero member variants of squads2..12.
const STRIKE_CLASS_PROOF={classHash:0x6adf06ae,
  classEvidence:'engineering-authored-class-census.json:16/17/18/19 ->80B0908E+10',
  closedCensusEvidence:'R427-SERVITOR-INTEGRATION.md: zero-initialized other squads; only issued Engineering allocations',
  retirementSemanticsEvidence:'R421-SQUAD-SENSE-SEMANTICS.md: full single allocation and cumulative retirement; no removal/unload issued'};
import { advanceVenusStrikeEngineering, createVenusStrikeEngineering,
  STRIKE_ENGINEERING_BUNDLE, type VenusStrikeEngineeringEffect,
  type VenusStrikeEngineeringEvent } from './venus-strike-engineering';
import { StrikeSquadObservations } from './strike-squad-sense';

export type VenusStrikeEngineeringRuntimeEffect = Exclude<VenusStrikeEngineeringEffect, {kind:'respawn'}>
  | (Extract<VenusStrikeEngineeringEffect, {kind:'respawn'}> & {cumulativePopulation?:readonly number[]});

type Payload = VenusStrikeEngineeringEvent extends infer E
  ? E extends VenusStrikeEngineeringEvent ? Omit<E, 'runId'|'activityId'|'bundle'|'observedAt'> : never : never;

/** Bounded Engineering adapter: actual kill evidence drives target progress.
 * Authored refill requests use retained native retirement; missing-member
 * allocation policy remains a labeled hypothesis awaiting runtime proof.
 */
export class VenusStrikeEngineeringRuntime {
  private readonly model;
  private state;
  private readonly observations = new StrikeSquadObservations();
  private readonly tokens: Record<number, string> = {};
  private readonly allocations = new Map<number, readonly number[]>();
  private readonly sentRequests = new Set<string>();
  private readonly deferredRefills = new Map<number, {
    effect: Extract<VenusStrikeEngineeringEffect, {kind:'respawn'}>; bindingToken:string;
  }>();
  private doorStage: 'create'|'open'|'delete' | undefined;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly queue: Payload[] = [];
  private draining = false;
  private stopped = false;
  private readonly killBatches = new Map<number, ServitorTargetBatchDraft>();

  constructor(private readonly runId: string,
    private readonly emit: (effect: VenusStrikeEngineeringRuntimeEffect) => void,
    private readonly log: (message: string) => void,
    private readonly player: EadPlayerIdentity) {
    this.model = createVenusStrikeEngineering(runId);
    this.state = this.model;
    this.observations.reset(runId);
    for (const group of [[19],[16],[17,18]] as const) {
      const batch=new ServitorTargetBatchDraft({runId,connectionLifetime:runId},group,STRIKE_CLASS_PROOF,player);
      for (const squad of group) this.killBatches.set(squad,batch);
    }
  }

  get exitDoorStage(): 'create'|'open'|'delete'|undefined { return this.doorStage; }
  get allocatedSquads(): number[] { return [...this.allocations.keys()]; }
  get servitorKills(): number { return this.state.defeated.length; }
  get completed(): boolean { return this.state.phase === 'complete'; }

  start(): void {
    if (this.stopped || this.state.phase !== 'new') return;
    this.dispatch({kind:'start'});
    this.dispatch({kind:'arrival',sensor:74,bound:true,loaded:true});
    // Audio integration is explicitly deferred, never a combat timeout.
    this.dispatch({kind:'dialogueResolved',sequence:22,resolution:'unavailable'});
  }

  stop(): void {
    this.stopped = true;
    for (const batch of new Set(this.killBatches.values())) batch.invalidate('Connection, slice or runtime stopped');
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.queue.length = 0;
    this.deferredRefills.clear();
    this.observations.reset(`${this.runId}/retired`);
  }

  observe(payload: Buffer): void {
    if (this.stopped || this.state.phase !== 'combat') return;
    const rows = this.observations.observe(payload, {epoch:this.runId,
      tokens:this.tokens,loaded:true,bound:true,now:Date.now()});
    for (const row of rows) {
      const requested = this.state.squads[row.squad];
      if (!requested || this.tokens[row.squad] !== row.token) continue;
      const deferred = this.deferredRefills.get(row.squad);
      if (deferred) {
        if (deferred.bindingToken !== row.token || requested.token !== deferred.effect.token ||
          this.state.pending?.kind !== 'spawn' || this.state.pending.token !== deferred.effect.token) {
          this.deferredRefills.delete(row.squad); // Retired request/binding, never retry it.
        } else {
          // This row is a genuine settled observation from the retained binding.
          // apply revalidates retirement, then sends at most once for this authored token.
          this.apply(deferred.effect);
          // The row predates the new allocation. It is not proof of materialization.
          // Unchanged allocations reuse their actual receipt inside apply instead.
          continue;
        }
      }
      this.log(`D1A_STRIKE_COHORT squad=${row.squad} sequence=${row.sequence} count=${row.currentCohortCount} retirement=${JSON.stringify(row.retirementRoster)}`);
      this.dispatch({kind:'snapshot',squad:row.squad,token:requested.token,
        bindingLifetimeId:`${this.runId}/${row.squad}`,sequence:row.sequence,
        bound:true,loaded:true,alive:row.currentCohortCount,aliveCountValidated:true});
      const batch=this.killBatches.get(row.squad);
      if (batch) this.acceptBatch(batch.cohort({squad:row.squad as 19|16|17|18,
        allocationToken:row.token,sequence:row.sequence,currentCohortCount:row.currentCohortCount,
        retirementRoster:row.retirementRoster},performance.now()));
    }
  }

  observeIncident(payload:Buffer):void {
    if (this.stopped || this.state.phase!=='combat') return;
    let event;
    try { event=decodeEadKill(payload,0); } catch { return; }
    if (!isPlayerToAiKill(event,this.player) || event.victim.baseHash!==STRIKE_CLASS_PROOF.classHash) return;
    if (this.state.killIds.includes(event.eventId)) return;
    const now=performance.now();
    const eligible=[...new Set(this.killBatches.values())].filter(batch=>batch.eligibleAt(now));
    if (eligible.length!==1) {
      for (const batch of eligible) batch.invalidate('Cross-group EAD ambiguity');
      this.log(`D1A_STRIKE_KILL_UNCORRELATED class=${event.victim.baseHash.toString(16)} groups=${eligible.length}`);
      return;
    }
    this.acceptBatch(eligible[0].decoded(event,now));
  }

  private acceptBatch(evidence:TargetBatchEvidence|null):void {
    if (!evidence) return;
    this.log(`D1A_STRIKE_SERVITOR_KILL_EVIDENCE ${JSON.stringify(evidence)}`);
    this.dispatch({kind:'targetGroupKillEvidence',evidence});
  }

  private dispatch(payload: Payload): void {
    if (this.stopped) return;
    this.queue.push(payload);
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length && !this.stopped) {
        const now = Date.now();
        const result = advanceVenusStrikeEngineering(this.state,
          {...this.queue.shift()!,runId:this.runId,activityId:4,
            bundle:STRIKE_ENGINEERING_BUNDLE,observedAt:now}, now);
        this.state = result.state;
        for (const effect of result.effects) this.apply(effect);
      }
    } finally { this.draining = false; }
  }

  private apply(effect: VenusStrikeEngineeringEffect): void {
    if (effect.kind === 'respawn') {
      const requestKey = `${effect.squad}/${effect.token}`;
      if (this.sentRequests.has(requestKey)) return;
      const previous = this.allocations.get(effect.squad);
      if (previous) {
        const bindingToken = this.tokens[effect.squad];
        const native = this.observations.validatedPopulation(effect.squad,bindingToken,Date.now());
        if (!native || effect.population.length !== previous.length ||
          native.allocation.some((n,i)=>n!==previous[i])) {
          const waiting = this.deferredRefills.get(effect.squad);
          if (!waiting || waiting.effect.token !== effect.token) {
            this.deferredRefills.set(effect.squad,{effect:{...effect,population:[...effect.population]},bindingToken});
            this.log(`D1A_STRIKE_REFILL_AWAITING_VALIDATED_RETIREMENT squad=${effect.squad} token=${effect.token}`);
          }
          return;
        }
        const cumulativePopulation = previous.map((n,i)=>Math.max(n,native.retirementRoster[i]+effect.population[i]));
        // Retain bindingToken: the model request token is not a native lifetime.
        this.observations.updateAllocation(effect.squad,bindingToken,cumulativePopulation);
        this.allocations.set(effect.squad,cumulativePopulation);
        this.sentRequests.add(requestKey);
        this.deferredRefills.delete(effect.squad);
        this.emit({...effect,cumulativePopulation}); // Encoder must emit Auth ONLY.
        this.log(`D1A_STRIKE_REFILL_HYPOTHESIS squad=${effect.squad} retired=${JSON.stringify(native.retirementRoster)} allocation=${JSON.stringify(cumulativePopulation)}`);
        this.dispatch({kind:'spawnRequested',squad:effect.squad,token:effect.token});
        // An unchanged allocation has no new cohort to await. Reuse only the
        // genuine retained receipt, never synthesize alive counts from Auth.
        if (cumulativePopulation.every((n,i)=>n===previous[i])) {
          this.dispatch({kind:'snapshot',squad:effect.squad,token:effect.token,
            bindingLifetimeId:`${this.runId}/${effect.squad}`,sequence:native.sequence,
            bound:true,loaded:true,alive:native.currentCohortCount,aliveCountValidated:true});
        }
        return;
      }
      const token = `${this.runId}/${effect.squad}/${effect.token}`;
      this.tokens[effect.squad] = token;
      this.allocations.set(effect.squad, [...effect.population]);
      this.observations.bind(effect.squad,token,effect.population);
      this.sentRequests.add(requestKey);
      this.emit(effect);
      this.killBatches.get(effect.squad)?.bind(effect.squad as 19|16|17|18,token,performance.now());
      this.dispatch({kind:'spawnRequested',squad:effect.squad,token:effect.token});
    } else if (effect.kind === 'authoredDelay') {
      // Native floor_spawn uses random_int_inclusive(3,6), in seconds.
      const delay = effect.minMs === 3000 && effect.maxMs === 6000
        ? (3 + Math.floor(Math.random() * 4)) * 1000
        : effect.minMs + Math.floor(Math.random() * (effect.maxMs-effect.minMs+1));
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.dispatch({kind:'delayElapsed',token:effect.token});
      }, delay);
      this.timers.add(timer);
    } else {
      if (effect.kind === 'createDoor') this.doorStage='create';
      if (effect.kind === 'doorOpen') this.doorStage='open';
      if (effect.kind === 'deleteDoor') {
        // Dialogue is unavailable, so immediate completion would otherwise
        // delete the just-opened device before its animation/traversal.
        // Keep its open Auth through refresh; actual slice/lifetime exit owns cleanup.
        this.log('D1A_STRIKE_EXIT_DOOR_DELETE_DEFERRED_TO_LIFETIME_EXIT; preserve opened Object0');
        return;
      }
      this.emit(effect);
      if (effect.kind === 'dialogue' && effect.sequence === 23) {
        this.log('D1A_STRIKE_DIALOGUE23_UNAVAILABLE; complete objective through explicit model resolution');
        this.dispatch({kind:'dialogueResolved',sequence:23,resolution:'unavailable'});
      }
    }
  }
}
