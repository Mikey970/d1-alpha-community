import fixture from './action-mission.fixture.json';
import {decodeStrikeSense} from './strike-squad-sense';
import {buildActionMockObjectiveActivationSenseEntries, type SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import {ACTION_BUNDLE,ACTION_OBJECTIVES,actionIncident,actionLifetimeComplete,actionObject,actionObjective,actionSequence,actionSquad,actionTrigger} from './action-mission-wire';

type Cohort={sequence:number; allocation:number; retired:number; alive:number; settled:boolean; initialized:boolean};
const entryKey=(e:SensorAuthSenseEntry)=>`${e.clientRef.bundle}/${e.clientRef.typeId}/${e.clientRef.typeIndex}`;
/** Activity1 translation of platform-host/0 HKS source lines104..167. Timers
 * below are authored presentation/respawn sleeps. Travel and device completion
 * require their exact native incidents; no elapsed-time completion substitute. */
export class ActionMission {
  private phase:'waiting'|'intro'|'incoming'|'active'|'gap'|'ending'|'complete'|'stopped'='waiting';
  private due=Infinity;
  private stage=0;
  private spawnTimer=0;
  private nextPoll=Infinity;
  private seen=new Set<string>();
  private cohorts=new Map<number,Cohort>([2,3,4,5].map(i=>[i,{sequence:-1,allocation:0,retired:0,alive:0,settled:true,initialized:false}]));
  readonly retained=new Map<string,SensorAuthSenseEntry>();
  constructor(private readonly clock:()=>number,private readonly tick:()=>number,
    private readonly send:(entries:SensorAuthSenseEntry[],label:string)=>void,
    private readonly random:()=>number=Math.random){}
  get started(){return this.phase!=='waiting';}
  get completed(){return this.phase==='complete';}
  get currentObjective(){return this.phase==='active'?fixture.orderedObjectives[this.stage]:undefined;}
  private emit(entries:SensorAuthSenseEntry[],label:string){
    for(const e of entries)this.retained.set(entryKey(e),e);
    this.send(entries,label);
  }
  sense(payload:Buffer){
    if(this.phase==='stopped'||this.phase==='complete')return;
    const decoded=decodeStrikeSense(payload);if(!decoded)return;
    for(const row of decoded.rows){
      if(row.bundle!==ACTION_BUNDLE)continue;
      if(row.type===1){
        const c=this.cohorts.get(row.index);if(!c||row.sequence<=c.sequence)continue;
        c.sequence=row.sequence;c.initialized=true;
        if(row.retirementRoster?.length===1)c.retired=row.retirementRoster[0];
        if(row.currentCohortCount!==undefined)c.alive=row.currentCohortCount;
        // A new request stays unsettled until native population and retirement
        // together account for it. Initial zero templates never prove a spawn.
        if(c.retired<=c.allocation && c.alive+c.retired===c.allocation)c.settled=true;
      }
      if(row.type===3&&row.index===0&&this.phase==='waiting'){
        this.phase='intro';this.due=this.clock()+fixture.beginSeconds*1000;
        this.emit([...buildActionMockObjectiveActivationSenseEntries(),actionObjective(10,true)],
          'native root receipt; authored five-second introduction');
      }
    }
  }
  update(){
    const now=this.clock();
    if(this.phase==='intro'&&now>=this.due){
      this.phase='incoming';this.due=now+fixture.incomingSeconds*1000;
      this.emit([actionObjective(10,false),actionObjective(22,true)],'first objective incoming');
    }else if(this.phase==='incoming'&&now>=this.due){
      // Client125 Sequence23 has no timeline resource (FFFFFFFF at+1F4).
      // It is the empty authored sequence; no speech or duration is invented.
      this.emit([actionSequence(this.tick())],'authored empty incoming Sequence23');this.activate();
    }else if(this.phase==='gap'&&now>=this.due){this.activate();
    }else if(this.phase==='ending'&&now>=this.due){
      this.phase='complete';
      // Authored host lines166..167 complete the activity before the end HUD.
      this.emit([actionLifetimeComplete(),actionObjective(11,true)],
        'all seven native objectives earned; Lifetime state6 then end objective');
    }
    if(this.phase==='active'&&now>=this.nextPoll){
      this.nextPoll=now+1000;
      if(this.spawnTimer<=0){
        this.spawnTimer=fixture.timeBetweenSpawns;
        const states=[...this.cohorts.values()];
        if(states.every(c=>c.initialized&&c.settled)&&states.reduce((n,c)=>n+c.alive,0)<=2){
          const squad=2+Math.min(3,Math.max(0,Math.floor(this.random()*4)));
          const c=this.cohorts.get(squad)!;
          c.allocation=c.retired+fixture.regularPopulation;c.settled=false;
          this.emit([actionSquad(squad,c.allocation)],`authored respawn squad=${squad} target=5 allocation=${c.allocation}`);
        }
      }else this.spawnTimer--;
    }
  }
  private activate(){
    this.phase='active';this.nextPoll=this.clock();
    const index=fixture.orderedObjectives[this.stage],o=ACTION_OBJECTIVES[index];
    const entries=[actionObjective(index,true,true)];
    if(o.trigger!==null)entries.push(actionTrigger(o.trigger,true,this.tick()));
    if(o.object!==null)entries.push(actionObject(o.object,true));
    this.emit(entries,`stage=${this.stage+1}/7 objective=${index} ${o.kind}; native completion required`);
  }
  incident(payload:Buffer){
    if(this.phase!=='active')return;
    const key=payload.toString('hex');if(this.seen.has(key))return;
    const event=actionIncident(payload);if(!event)return;
    const index=fixture.orderedObjectives[this.stage],o=ACTION_OBJECTIVES[index];
    if(event.kind!==o.kind||event.id!==(event.kind==='travel'?o.trigger:o.incidentHash))return;
    this.seen.add(key);
    const entries=[actionObjective(index,false)];
    if(o.trigger!==null)entries.push(actionTrigger(o.trigger,false,this.tick()));
    if(o.object!==null)entries.push(actionObject(o.object,false));
    this.emit(entries,`native ${event.kind} completed stage=${this.stage+1}/7 objective=${index}`);
    this.stage++;
    this.phase=this.stage===fixture.orderedObjectives.length?'ending':'gap';
    // The script traverses all16 slots, sleeping one second for each zero slot.
    this.due=this.clock()+1000*(this.phase==='ending'?1+fixture.remainingEmptySteps:fixture.interObjectiveSeconds);
  }
  stop(){this.phase='stopped';}
}
