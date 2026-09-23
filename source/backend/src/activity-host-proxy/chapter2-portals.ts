import {buildVenusSouthernPortalEntry,buildVenusSouthernPortalSquad,type SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import type {readVenusGateSense} from './venus-gate-progress';

type Gate={index:number;sequence:number;live:boolean;started:boolean;version:number;power:number;activate:number;
  stage:number;drop?:{squad:number;sequence:number};pendingSeen:boolean;spawnSeen:boolean;done:boolean;
  timer?:ReturnType<typeof setTimeout>};
const WAVES:Record<number,readonly number[]>={70:[25,26],72:[27,28,30],74:[31,32,33,34],76:[35,36,37,38],129:[104,105,106,107],131:[108,109,110,111]};

/** Script31 gate workers and utility62. Native observations release the next
 * drop; timers reproduce authored sleeps, never manufacture completion. */
export class Chapter2Portals {
  readonly retained=new Map<string,SensorAuthSenseEntry>();
  private gates=new Map<number,Gate>();
  private squads=new Map<number,{sequence:number;members:number}>();
  private monitors=new Map<number,{sequence:number;inside:boolean}>();
  private cycles=new Map<number,number>();
  private count=0;
  private stopped=false;
  private enabled:boolean;
  constructor(private send:(entries:SensorAuthSenseEntry[],label:string)=>void,private random=()=>Math.random(),private northern=false){
    this.enabled=!northern;
    for(const index of northern?[129,131]:[70,72,74,76])this.gates.set(index,{index,sequence:-1,live:false,started:false,
      version:0,power:0,activate:0,stage:0,pendingSeen:false,spawnSeen:false,done:false});
  }
  start(){this.enabled=true;for(const g of this.gates.values())this.advance(g);}
  private emit(entries:SensorAuthSenseEntry[],label:string){
    for(const e of entries)this.retained.set(`${e.clientRef.typeId}/${e.clientRef.typeIndex}`,e);
    this.send(entries,label);
  }
  private channels(g:Gate,power=g.power,activate=g.activate){
    g.power=power;g.activate=activate;
    this.emit([buildVenusSouthernPortalEntry(g.index,++g.version,power,activate,g.drop)],
      `gate=${g.index} power=${power} activate=${activate} channelVersion=${g.version}`);
  }
  private later(g:Gate,ms:number,fn:()=>void){
    if(this.stopped||!g.live||g.timer)return;
    g.timer=setTimeout(()=>{g.timer=undefined;if(!this.stopped&&g.live)fn();},ms);
  }
  private between(min:number,max:number){return (min+Math.floor(this.random()*(max-min+1)))*1000;}
  observe(update:ReturnType<typeof readVenusGateSense>,count:number){
    if(this.stopped||!update)return;
    this.count=count;
    for(const a of update.actors){
      const g=this.gates.get(a.index);if(!g||a.sequence<=g.sequence)continue;
      g.sequence=a.sequence;
      if(a.terminal||a.generation!==undefined&&a.generation!==1){
        g.live=false;if(g.timer)clearTimeout(g.timer);g.timer=undefined;continue;
      }
      if(a.bound&&a.generation===1)g.live=true;
      if(g.live&&g.drop&&a.dropSequence===g.drop.sequence){
        if(a.dropping===1)g.pendingSeen=true;
        if(a.dropping===0&&g.pendingSeen)g.done=true;
      }
    }
    for(const s of update.squads){
      if(!s.valid||s.members===undefined||s.sequence<=(this.squads.get(s.index)?.sequence??-1))continue;
      this.squads.set(s.index,{sequence:s.sequence,members:s.members});
      for(const g of this.gates.values())if(g.drop?.squad===s.index&&s.members>0)g.spawnSeen=true;
    }
    for(const m of update.monitors)if(m.sequence>(this.monitors.get(m.index)?.sequence??-1))
      this.monitors.set(m.index,{sequence:m.sequence,inside:m.anyInside});
    for(const g of this.gates.values())this.advance(g);
  }
  private advance(g:Gate){
    if(this.stopped||!this.enabled||!g.live||g.timer)return;
    if(!g.started){
      if(!this.northern&&this.count<(g.index===70?0:g.index===72?1:2))return;
      g.started=true;
      if(g.index===70){this.channels(g,0.2,0);this.begin(g);}
      else this.later(g,this.between(1,2),()=>{
        this.channels(g,0.1,0);
        this.later(g,2000,()=>{this.channels(g,0.2,0);this.later(g,5000,()=>this.begin(g));});
      });
      return;
    }
    if(!g.done||!g.spawnSeen)return;
    const waves=WAVES[g.index],last=g.stage===waves.length-1;
    if(last&&g.index===70)return;
    if(g.index===70&&(this.squads.get(25)?.members??Infinity)>=2)return;
    if(g.index===72&&g.stage>=1&&!this.monitors.get(144)?.inside)return;
    if((g.index===74||g.index===76)&&!this.monitors.get(146)?.inside)return;
    if(last&&(this.squads.get(waves[g.stage])?.members??Infinity)>1)return;
    if(this.northern&&g.stage===2){
      const group=waves.map(s=>this.squads.get(s)?.members);
      // The last reinforcement squad is not allocated yet. Require native
      // counts for all three initial drops; absence does not mean zero.
      if(group.slice(0,3).some(n=>n===undefined)||group.slice(0,3).reduce((a,b)=>a!+b!,0)! >= (g.index===129?4:2))return;
    }
    g.done=false;
    if(!last)g.stage++;
    const reinforcement=g.stage===waves.length-1&&g.index!==70;
    const delay=reinforcement?this.between(5,45):this.northern?(g.stage===1?this.between(3,6):this.between(4,7)):g.index===70?0:
      g.stage===1?this.between(1,2):this.between(3,5);
    this.later(g,delay,()=>this.begin(g));
  }
  private begin(g:Gate){
    this.channels(g,0.2,1);
    this.later(g,2000,()=>{
      const squad=WAVES[g.index][g.stage];
      const cycle=(this.cycles.get(squad)??0)+1;this.cycles.set(squad,cycle);
      g.drop={squad,sequence:(g.drop?.sequence??0)+1};g.pendingSeen=false;g.spawnSeen=false;g.done=false;
      this.emit([buildVenusSouthernPortalSquad(squad,cycle),
        buildVenusSouthernPortalEntry(g.index,++g.version,g.power,g.activate,g.drop)],
        `gate=${g.index} squad=${squad} drop=${g.drop.sequence} allocationCycle=${cycle}; native spawn required`);
    });
  }
  stop(){this.stopped=true;for(const g of this.gates.values())if(g.timer)clearTimeout(g.timer);}
}
