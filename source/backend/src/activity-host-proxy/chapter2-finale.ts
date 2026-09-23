import {Chapter2Dialogue} from './chapter2-dialogue';
import {readVenusNorthernSense} from './venus-northern-progress';
import {buildChapter2EndGate,buildVenusPlayerObjectiveEntry} from './rsat/mocks/sensor-auth';
import type {SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';

/** Script32: death -> 4s -> device position1 -> 5s -> d050 -> monitor154 -> d060.
 * Speech completion is explicitly estimated from packaged audio duration. Device
 * completion requires a fresh native receipt; no elapsed-time gate credit. */
export class Chapter2Finale {
  readonly retained=new Map<string,SensorAuthSenseEntry>();
  private dead=false;
  private opened=false;
  private arrived=false;
  private firstSpeechDone=false;
  private finalSpeechStarted=false;
  private stopped=false;
  private deviceSequence=-1;
  private monitorSequence=-1;
  private timers=new Set<ReturnType<typeof setTimeout>>();
  complete=false;
  constructor(private readonly dialogue:Chapter2Dialogue,
    private readonly send:(entry:SensorAuthSenseEntry,label:string)=>void){}
  private emit(entry:SensorAuthSenseEntry,label:string){
    this.retained.set(`${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`,entry);this.send(entry,label);
  }
  private later(ms:number,action:()=>void){
    const t=setTimeout(()=>{this.timers.delete(t);if(!this.stopped)action();},ms);this.timers.add(t);
  }
  bossDefeated(){
    if(this.dead||this.stopped)return;this.dead=true;
    this.later(4000,()=>this.emit(buildChapter2EndGate(true),'Chapter2 end-gate position1 command; awaiting native device receipt'));
  }
  observe(update:ReturnType<typeof readVenusNorthernSense>){
    if(!update||this.stopped)return;
    for(const m of update.monitors)if(m.index===154&&m.sequence>this.monitorSequence){
      this.monitorSequence=m.sequence;this.arrived=m.anyInside;
    }
    for(const d of update.devices??[])if(d.sequence>this.deviceSequence){
      this.deviceSequence=d.sequence;
      if(this.dead&&!this.opened&&this.retained.has('4/77')&&d.revision>=1&&d.position>=1){
        this.opened=true;
        this.later(5000,()=>this.dialogue.endGateDialogue(()=>{
          if(this.stopped)return;
          this.firstSpeechDone=true;
          this.emit(buildVenusPlayerObjectiveEntry(120,0),'Chapter2 boss objective ended after shutdown dialogue timeline');
          this.finishIfReady();
        }));
      }
    }
    this.finishIfReady();
  }
  private finishIfReady(){
    if(!this.firstSpeechDone||!this.arrived||this.finalSpeechStarted||this.stopped)return;
    this.finalSpeechStarted=true;
    this.dialogue.endMissionDialogue(()=>{
      if(this.stopped)return;
      this.complete=true;
      this.emit(buildVenusPlayerObjectiveEntry(127,1),'Chapter2 closing dialogue timeline ended; authored Return to Orbit objective');
    });
  }
  stop(){this.stopped=true;for(const t of this.timers)clearTimeout(t);this.timers.clear();}
}
