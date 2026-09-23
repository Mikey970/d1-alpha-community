import {BitWriter} from '@blamnetwork/rsat';
import {ActorAuth,HealthAuth,ObjectAuth,ObjectiveSense,PlayerMonitorAuth,PlayerObjectiveAuth,SensorClientRef,SquadAuth} from './rsat/schemas/sensor';
import {encodeLifetimeAuth,encodeObjectiveReceivedState,encodeSquadAuth,encodeSquadSense,type SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import {GLOBAL,MINION_POPULATIONS} from './strike-later-controller';
type Body={bytes:Buffer;bitCount:number};
const UNSET={bundle:0x811c9dc5,typeId:-1,typeIndex:-1};
const ref=(typeId:number,typeIndex:number)=>({bundle:GLOBAL,typeId,typeIndex});
const exact=(fn:(w:BitWriter)=>void):Body=>{const w=new BitWriter(4096);fn(w);return {bytes:w.finish(),bitCount:w.bitCount};};
const entry=(type:number,index:number,body:Body,senseBound=true,sense?:Body):SensorAuthSenseEntry=>({clientRef:ref(type,index),
  authSchemaBound:true,senseSchemaBound:senseBound,authBody:body.bytes,authBits:body.bitCount,
  senseBody:sense?.bytes,senseBits:sense?.bitCount,isReceivedSenseState:!!sense,
  nativeBodyFraming:true,isSenseUpdateRelative:!sense,...(sense?{senseStateSequence:0}:{})});
export function ruinsObjectiveTasks(boss=false,initial=false){return entry(3,38,exact(w=>ObjectiveSense.encode(w,{
  table:{values:Array.from({length:24},(_,i)=>i<3?(boss||i===1?1:0):undefined)},unk1:undefined})),true,initial?encodeObjectiveReceivedState():undefined);}
export function ruinsSquad(squad:number,population:number,initial:boolean){
  const guard=squad>=47&&squad<=52,normal=guard||Object.hasOwn(MINION_POPULATIONS,squad);
  if((!normal&&squad!==45)||!Number.isSafeInteger(population)||population<0||population>0x7fffffff||
    (squad===45&&population!==0))throw Error('Unsupported Ruins allocation');
  return entry(1,squad,exact(w=>SquadAuth.encode(w,{ref0:ref(3,38),ref1:undefined,filter:undefined,
    roster:{slots:[population]},unk4:undefined,unk5:1,unk6:undefined,unk7:undefined,
    unk8:squad===45?0:guard?1:2,unk9:0,unk10:0})),true,initial?encodeSquadSense(1,true,[population]):undefined);
}
export function ruinsActor(actor:number,generation=1,enabled=true){
  if(![40,42,44,46].includes(actor))throw Error('Unsupported direct actor');
  return entry(2,actor,exact(w=>ActorAuth.encode(w,{unk0:generation,unk1:0,unk2:0,flag3:enabled,
    nest4:undefined,nest5:undefined,script:undefined,nest7:undefined})));
}
export function ruinsHealth(){return entry(19,78,exact(w=>HealthAuth.encode(w,{ref:ref(2,46),unk1:-1,unk2:-1,unk3:0})));}
export function ruinsMonitor(index:number){const volume:Record<number,number>={79:143,80:144,81:142};
  if(volume[index]===undefined)throw Error('Unsupported monitor');
  return entry(28,index,exact(w=>PlayerMonitorAuth.encode(w,{ref:ref(57,volume[index]),unk:0})));}
export function ruinsDrop(actor:number,squad:number,sequence:number,generation:number){
  if(![40,42,44].includes(actor)||Math.floor((squad-54)/3)!==(actor-40)/2||!Object.hasOwn(MINION_POPULATIONS,squad)||
    !Number.isSafeInteger(generation)||generation<1||generation>0x7fffffff||
    !Number.isSafeInteger(sequence)||sequence<1||sequence>0x7fffffff)throw Error('Invalid authored warpstorm request');
  return entry(2,actor,exact(w=>{w.writeBit(1);w.write(generation,31);w.write(1,2);w.write(1,3);w.writeBit(1);
    w.writeBit(0);w.writeBit(0);w.writeBit(0);w.writeBit(1);w.write(1,4);SensorClientRef.encode(w,ref(1,squad));w.write(sequence,31);}));
}
export function ruinsCache(index:number,generation:number,active:boolean){
  if(![35,36,37].includes(index)||!Number.isSafeInteger(generation)||generation<1)throw Error('Invalid authored cache');
  return entry(4,index,exact(w=>{w.write(generation+0x80000000,32);w.writeBit(active?1:0);SensorClientRef.encode(w,UNSET);w.write(0,4);}));
}
export function ruinsHud(index:66|71,active:boolean,current=0){
  if(![66,71].includes(index)||!Number.isInteger(current)||current<0||current>1||(index===71&&current!==0))throw Error('Invalid Ruins HUD');
  return entry(32,index,exact(w=>PlayerObjectiveAuth.encode(w,{unk0:active?1:0,ref1:UNSET,flag2:false,
    options:{flag0:false,windowOpen:-0x80000000,windowClose:0x7fffffff,unk3:0,unk4:0,unk5:0,scalar:1},
    unk4:index===66?1:0,unk5:current,unk6:index===66?1:0,ref7:UNSET,
    slots:{slots:Array.from({length:10},(_,slot)=>({unk0:active&&index===66&&slot===0?1:0,
      ref:active&&index===66&&slot===0?ref(43,151):UNSET,
      // Native2292_808004C5 Nav151 row230, position240; marker only.
      kind13:active&&index===66&&slot===0?Buffer.from('c2144016c373000fc1a5de4b','hex'):Buffer.alloc(12),unk3:0,unk4:0}))},unk9:0,unk10:0})),false);
}
/** Native835BF718 ->82A47714 requires state6; non-recycling goal becomes Orbit.
 * Preserve the proven current phase fields. HostPhase158 is not phaseIndex158. */
export function ruinsLifetimeEnd(){const e=entry(16,3,encodeLifetimeAuth(6,'venus_portal_1'),false);
  return {...e,clientRef:{bundle:0x4786c0e0,typeId:16,typeIndex:3}};}
export type RuinsRetainedAuth={managedKeys:readonly string[];authEntries:readonly SensorAuthSenseEntry[]};
export function preserveRuinsApply(entries:SensorAuthSenseEntry[],state:RuinsRetainedAuth):SensorAuthSenseEntry[]{
  const keys=new Set(state.managedKeys);return [...entries.filter(e=>!keys.has(`${e.clientRef.bundle}/${e.clientRef.typeId}/${e.clientRef.typeIndex}`)),...state.authEntries];
}

export function ruinsStormSquad(actor:number){
  if(![40,42,44].includes(actor))throw Error('Unsupported storm parent');
  return entry(1,actor-1,encodeSquadAuth(1,[0]),true,encodeSquadSense(1,true,[0]));
}
