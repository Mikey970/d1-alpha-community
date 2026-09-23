import {ActivityBundleItemType} from '../tags/types';
import {BitWriter,BitReader} from '@blamnetwork/rsat';
import {SequenceAuth,PlayerTriggerAuth,SensorClientRef} from './rsat/schemas/sensor';
import type {SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import {STRIKE_DIALOGUE_CUES,type StrikeDialogueCue} from './strike-dialogue-catalog';

/** Native consumer8381A928: +0=start tick, +4=playback ID (255 stops),
 * +8=two state hash/value pairs. 811C9DC5 means no state override.
 * Sequence has no bound Sense in the existing registry. Sending playback is
 * not evidence of audible output or mission completion.
 */
export function strikeDialogueEntry(cue:StrikeDialogueCue,tick:number):SensorAuthSenseEntry {
  if(!Number.isInteger(tick)||tick<0||tick>0x7fffffff)throw Error('Invalid dialogue activity tick');
  const w=new BitWriter(256);
  SequenceAuth.encode(w,{unk0:tick,unk1:1,
    pair:{a:{f0:0x811c9dc5,f1:0x811c9dc5},b:{f0:0x811c9dc5,f1:0x811c9dc5}},
    ref:{bundle:0x811c9dc5,typeId:-1,typeIndex:-1}});
  return {clientRef:{bundle:0x0a302429,typeId:ActivityBundleItemType.Sequence,typeIndex:STRIKE_DIALOGUE_CUES[cue].sequence},
    authSchemaBound:true,senseSchemaBound:false,nativeBodyFraming:true,
    isReceivedSenseState:false,isSenseUpdateRelative:true,authBody:w.finish(),authBits:w.bitCount};
}

export function strikeDialogueTriggerEntry(index:76|77|83):SensorAuthSenseEntry {
  const w=new BitWriter(64);PlayerTriggerAuth.encode(w,{flag:true,unk:0});
  return {clientRef:{bundle:0x0a302429,typeId:29,typeIndex:index},authSchemaBound:true,
    senseSchemaBound:false,nativeBodyFraming:true,isReceivedSenseState:false,isSenseUpdateRelative:true,
    authBody:w.finish(),authBits:w.bitCount};
}
/** Same exact DD6D986F form as validated Engineering/DigSite arrivals. */
export function strikeDialogueTrigger(payload:Buffer,slice:number|undefined):StrikeDialogueCue|undefined {
  if(payload.length!==50)return;
  try {
    const r=new BitReader(payload);
    if(r.readNumber(4)!==1||(r.readNumber(32)>>>0)!==0xdd6d986f)return;
    while(r.bitPos<310)r.readBit();const ref=SensorClientRef.decode(r);
    if((ref.bundle>>>0)!==0x0a302429||ref.typeId!==29||
      (r.readNumber(32)>>>0)!==0x811c9dc5||r.readNumber(4)!==0)return;
    if(slice===5&&ref.typeIndex===76)return 'digSiteFirst';
    if(slice===5&&ref.typeIndex===77)return 'digSiteSecond';
    if(slice===28&&ref.typeIndex===83)return 'ruinsIntro';
  } catch {return;}
}

/** Serialize authored clips within one occupied slice; never advances combat. */
export class StrikeDialoguePlayback {
  private pending:StrikeDialogueCue[]=[];
  private seen=new Set<StrikeDialogueCue>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private stopped=false;
  constructor(private readonly send:(cue:StrikeDialogueCue)=>void){}
  enqueue(cue:StrikeDialogueCue){
    if(this.stopped||this.seen.has(cue))return;
    this.seen.add(cue);this.pending.push(cue);if(!this.timer)this.next();
  }
  stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.pending=[];}
  private next(){
    const cue=this.pending.shift();if(!cue||this.stopped)return;
    this.send(cue);
    this.timer=setTimeout(()=>{this.timer=undefined;this.next();},Math.ceil(STRIKE_DIALOGUE_CUES[cue].durationSeconds*1000)+250);
  }
}
