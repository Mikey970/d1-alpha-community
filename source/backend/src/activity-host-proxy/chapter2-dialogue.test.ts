import {afterEach,describe,expect,it,vi} from 'vitest';
import {BitReader,BitWriter} from '@blamnetwork/rsat';
import {SequenceAuth,SensorClientRef} from './rsat/schemas/sensor';
import {Chapter2Dialogue,CHAPTER2_DURATIONS,chapter2SequenceEntry,readChapter2DialogueTrigger} from './chapter2-dialogue';
import type {SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';

// Exact captured DD6D986F framing, with explicit fixture reference substitution.
function incident(index:number,bundle=0x517641f1){
  const w=new BitWriter(512);w.write(1,4);w.write(0xdd6d986f,32);
  while(w.bitCount<310)w.writeBit(0);
  SensorClientRef.encode(w,{bundle,typeId:29,typeIndex:index});
  w.write(0x811c9dc5,32);w.write(0,4);return w.finish();
}
afterEach(()=>vi.useRealTimers());
it('introduces sample collection after identifying the device, before progress dialogue',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
 const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(10);
 d.incident(incident(138));
 vi.advanceTimersByTime(11000);
 expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toEqual([21,22]);
 d.fluids(10);vi.advanceTimersByTime(20000);
 expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toEqual([21,22,13]);d.stop();
});
it('retires the sample instruction if collection finishes before its trigger or fallback',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
 const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(10);
 d.incident(incident(138));vi.advanceTimersByTime(8000);
 d.fluids(10);d.incident(incident(139));vi.advanceTimersByTime(30000);
 expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toEqual([21,13]);d.stop();
});
describe('Chapter2 dialogue event and playback boundaries',()=>{
  it('uses native stopped255 for every idle speech resource and real type5 for playback',()=>{
    expect(Object.keys(CHAPTER2_DURATIONS)).toHaveLength(22);
    for(const index of Object.keys(CHAPTER2_DURATIONS).map(Number)){
      const idle=chapter2SequenceEntry(index,0);
      expect(idle.clientRef.typeId).toBe(5);
      expect(SequenceAuth.decode(new BitReader(idle.authBody!)).unk1).toBe(255);
    }
    const playing=SequenceAuth.decode(new BitReader(chapter2SequenceEntry(5,900,true).authBody!));
    expect(playing).toMatchObject({unk0:900,unk1:1});
    expect(playing.pair.a.f0>>>0).toBe(0x811c9dc5);
  });
  it('does not request triggered intro at startup, reject foreign triggers, and deduplicate receipts',()=>{
    vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
    const d=new Chapter2Dialogue(()=>100,(e)=>sent.push(e));d.enter(8);
    d.incident(incident(134));expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([5]);
    vi.advanceTimersByTime(14000);expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([5,134]);
    expect(readChapter2DialogueTrigger(incident(134,0x0a302429))).toBeUndefined();
    d.incident(incident(134));d.incident(incident(134));
    expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([5,134,11]);d.stop();
  });
  it('waits for the device introduction when collection completes before the native trigger',()=>{
    vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
    const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(10);d.fluids(4);
    expect(sent.filter(e=>e.clientRef.typeId===5)).toHaveLength(0);
    d.fluids(5);d.fluids(10);
    expect(sent.filter(e=>e.clientRef.typeId===5)).toHaveLength(0);
    d.incident(incident(138));
    expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toEqual([21]);
    vi.advanceTimersByTime(8000);
    expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toEqual([21,13]);d.stop();
  });
  it('cancels queued work when the activity session closes; fresh session can replay intro',()=>{
    vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
    const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(8);d.stop();vi.advanceTimersByTime(60000);
    expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([5]);
    const next=new Chapter2Dialogue(()=>1,e=>sent.push(e));next.enter(8);
    expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([5,5]);next.stop();
  });
});

it('starts speech on the native landing and does not replay it on reaching the Captain',()=>{
  vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
  const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(16);
  expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([5]);
  vi.advanceTimersByTime(14000);d.enter(7);d.enter(8);
  expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toEqual([5]);
  d.incident(incident(134));expect(sent[sent.length-1]?.clientRef.typeIndex).toBe(11);d.stop();
});

it('arms phase01 dialogue during approach and still requires a native spatial incident',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
 const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(21);d.phaseOne();
 expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([138]);
 d.incident(incident(138));d.incident(incident(138));
 expect(sent.map(e=>e.clientRef.typeIndex)).toEqual([138,21]);d.stop();
});
