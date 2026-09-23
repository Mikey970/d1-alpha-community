import {BitReader, BitWriter} from '@blamnetwork/rsat';
import {PlayerObjectiveAuth, PlayerTriggerAuth, SensorClientRef, SequenceAuth} from './rsat/schemas/sensor';
import {emptyActivityOptions} from './rsat/mocks/sensor-auth';
import {encodeLifetimeAuth,encodeSquadAuth, type SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import fixture from './action-mission.fixture.json';

export const ACTION_BUNDLE = fixture.bundle;
const empty = {bundle:0x811c9dc5,typeId:-1,typeIndex:-1};
const ref = (typeId:number,typeIndex:number) => ({bundle:ACTION_BUNDLE,typeId,typeIndex});
export const ACTION_OBJECTIVES: Readonly<Record<number,{
  kind:string; nav:number; positionHex:string; trigger:number|null; object:number|null; incidentHash:number|null;
}>> = fixture.objectives;
function entry(type:number,index:number,w:BitWriter,sense=false):SensorAuthSenseEntry {
  return {clientRef:ref(type,index),authSchemaBound:true,senseSchemaBound:sense,
    nativeBodyFraming:true,fullAuthState:true,isReceivedSenseState:false,isSenseUpdateRelative:true,
    authBody:w.finish(),authBits:w.bitCount};
}
export function actionObjective(index:number,active:boolean,marker=false):SensorAuthSenseEntry {
  if(index!==10 && index!==11 && !ACTION_OBJECTIVES[index]) throw Error('Unverified Action objective');
  const row=ACTION_OBJECTIVES[index], w=new BitWriter(4096);
  PlayerObjectiveAuth.encode(w,{unk0:active?1:0,ref1:empty,flag2:false,options:emptyActivityOptions(),
    unk4:0,unk5:0,unk6:0,ref7:empty,slots:{slots:Array.from({length:10},(_,i)=>({
      unk0:active&&marker&&i===0?1:0,
      ref:active&&marker&&i===0?ref(43,row.nav):empty,
      kind13:active&&marker&&i===0?Buffer.from(row.positionHex,'hex'):Buffer.alloc(12),unk3:0,unk4:0,
    }))},unk9:0,unk10:0});
  return entry(32,index,w);
}
export function actionTrigger(index:number,enabled:boolean,tick:number):SensorAuthSenseEntry {
  if(![62,63,64].includes(index))throw Error('Unverified Action trigger');
  const w=new BitWriter(64);PlayerTriggerAuth.encode(w,{flag:enabled,unk:tick});return entry(29,index,w);
}
/** The three packaged interactable templates include native component80802DAA.
 * Its80802DA2 command matches the recovered Southern device encoder. Enabling
 * the current solo objective never manufactures the activated/completed bit. */
export function actionObject(index:number,enabled:boolean):SensorAuthSenseEntry {
  if(![21,40,41].includes(index))throw Error('Unverified Action interactable');
  const w=new BitWriter(512);
  w.write(0x80000001,32);w.writeBit(1);SensorClientRef.encode(w,empty);w.write(1,4);
  w.writeBit(1);w.write(0x80802da2,32);w.write(enabled?3:2,2);
  SensorClientRef.encode(w,empty);w.write(0x80000000,32);w.writeBit(0);
  return entry(4,index,w,true);
}
export function actionSequence(tick:number):SensorAuthSenseEntry {
  const w=new BitWriter(256);SequenceAuth.encode(w,{unk0:tick,unk1:1,
    pair:{a:{f0:0x811c9dc5,f1:0x811c9dc5},b:{f0:0x811c9dc5,f1:0x811c9dc5}},ref:empty});
  return entry(5,23,w);
}
/** Native82A47714..28 requires Lifetime state6 for the completion transition.
 * 835BF718 reads component+100, populated by the Lifetime receive callback.
 * Action's packaged80A8A008 binds Lifetime at4786C0E0/16/3. Preserve the
 * existing phase metadata; this publication changes only the lifetime state. */
export function actionLifetimeComplete():SensorAuthSenseEntry {
  const body=encodeLifetimeAuth(6,'action_mock');
  return {clientRef:{bundle:0x4786c0e0,typeId:16,typeIndex:3},
    authSchemaBound:true,senseSchemaBound:false,nativeBodyFraming:true,
    fullAuthState:true,isReceivedSenseState:false,isSenseUpdateRelative:true,
    authBody:body.bytes,authBits:body.bitCount};
}
/** Respawn requests restore the authored five-member population. Only Auth is
 * published; the client's own Sense supplies placement, casualties and totals. */
export function actionSquad(index:number,allocation:number):SensorAuthSenseEntry {
  if(![2,3,4,5].includes(index)||!Number.isSafeInteger(allocation)||allocation<5||allocation>0x7fffffff)
    throw Error('Invalid Action allocation');
  const bits=encodeSquadAuth(1,[allocation],{firingAreaSet:ref(3,0)});
  return {clientRef:ref(1,index),authSchemaBound:true,senseSchemaBound:true,nativeBodyFraming:true,
    fullAuthState:true,isReceivedSenseState:false,isSenseUpdateRelative:true,
    authBody:bits.bytes,authBits:bits.bitCount};
}
/** Shared native incident layouts, restricted to this bundle/object identity. */
export function actionIncident(payload:Buffer):{kind:'travel'|'interact';id:number}|undefined {
  try {
    const r=new BitReader(payload);if(r.readNumber(4)!==1)return;
    const hash=r.readNumber(32)>>>0;
    if(payload.length===50&&hash===0xdd6d986f){
      while(r.bitPos<310)r.readBit();const target=SensorClientRef.decode(r);
      if((target.bundle>>>0)!==ACTION_BUNDLE||target.typeId!==29||![62,63,64].includes(target.typeIndex)||
        (r.readNumber(32)>>>0)!==0x811c9dc5||r.readNumber(4)!==0)return;
      return {kind:'travel',id:target.typeIndex};
    }
    if(payload.length===44&&hash===0xe882d22f){
      while(r.bitPos<310)r.readBit();const id=r.readNumber(32)>>>0;
      if(r.readNumber(10)!==0||!Object.values(ACTION_OBJECTIVES).some(x=>x.incidentHash===id))return;
      return {kind:'interact',id};
    }
  }catch{return;}
}
