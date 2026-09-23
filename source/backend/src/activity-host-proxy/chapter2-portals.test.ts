import {afterEach,expect,it,vi} from 'vitest';
import {BitReader} from '@blamnetwork/rsat';
import {SensorClientRef} from './rsat/schemas/sensor';
import {buildVenusSouthernPortalEntry,buildVenusNorthernAmbientEntries,type SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
import {Chapter2Portals} from './chapter2-portals';
afterEach(()=>vi.useRealTimers());
it('encodes the native channel vector, stable generation and owning-gate drop reference',()=>{
 const e=buildVenusSouthernPortalEntry(70,3,0.2,1,{squad:25,sequence:1});
 const r=new BitReader(e.authBody!);
 expect(r.readNumber(1)).toBe(1);expect(r.readNumber(31)).toBe(1);
 expect(r.readNumber(2)).toBe(1);expect(r.readNumber(3)).toBe(1);expect(r.readNumber(1)).toBe(1);
 expect(r.readNumber(1)).toBe(1);expect(r.readNumber(31)).toBe(3);
 expect(r.readNumber(2)).toBe(0);expect(r.readNumber(3)).toBe(0);
 expect(SensorClientRef.decode(r).typeId).toBe(-1);expect(r.readNumber(32)).toBe(1);
 expect(r.readNumber(3)).toBe(2);
 for(const [hash,scalar] of [[0x175b82aa,0x3e4ccccd],[0xf85655be,0x3f800000]]){
  expect(r.readNumber(32)>>>0).toBe(hash);for(let i=0;i<4;i++)expect(r.readNumber(32)>>>0).toBe(scalar);
 }
 expect(r.readNumber(2)).toBe(0);expect(r.readNumber(1)).toBe(1);expect(r.readNumber(4)).toBe(1);
 expect(SensorClientRef.decode(r).typeIndex).toBe(25);expect(r.readNumber(31)).toBe(1);
 expect(r.bitPos).toBe(e.authBits);expect(e.senseBody).toBeUndefined();
 expect(()=>buildVenusSouthernPortalEntry(70,1,0.2,1,{squad:31,sequence:1})).toThrow();
});
it('waits for Northern entry then powers both utility gates before native drops',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
 const p=new Chapter2Portals(e=>sent.push(...e),()=>0,true);
 p.observe({actors:[129,131].map(index=>({index,sequence:1,generation:1,terminal:false,bound:true,dropping:0})),squads:[],monitors:[]},0);
 vi.advanceTimersByTime(30000);expect(sent).toHaveLength(0);
 p.start();vi.advanceTimersByTime(9999);
 expect(sent.filter(e=>e.clientRef.typeId===1)).toHaveLength(0);
 vi.advanceTimersByTime(1);
 expect(sent.filter(e=>e.clientRef.typeId===1).map(e=>e.clientRef.typeIndex)).toEqual([104,108]);
 expect(sent.every(e=>e.senseBody===undefined)).toBe(true);p.stop();
});
it('places the authored Northern guards once; refreshing sends no placement sense',()=>{
 expect(buildVenusNorthernAmbientEntries(true).filter(e=>e.clientRef.typeId===1)).toHaveLength(7);
 expect(buildVenusNorthernAmbientEntries().every(e=>e.senseBody===undefined)).toBe(true);
});
it('starts only gate00, requires native drop and squad evidence, and cancels on gate death',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
 const p=new Chapter2Portals(e=>sent.push(...e),()=>0);
 const actor=(index:number,sequence:number,terminal=false,dropSequence?:number,dropping=0)=>({index,sequence,terminal,generation:1,bound:true,dropSequence,dropping});
 p.observe({actors:[70,72,74,76].map(i=>actor(i,1)),squads:[],monitors:[]},0);
 vi.advanceTimersByTime(2000);
 expect(sent.filter(e=>e.clientRef.typeId===1).map(e=>e.clientRef.typeIndex)).toEqual([25]);
 expect(sent.every(e=>e.senseBody===undefined)).toBe(true);
 // An initial pending=0 cannot release the next squad.
 p.observe({actors:[actor(70,2,false,1,0)],squads:[{index:25,members:1,valid:true,sequence:1}],monitors:[]},0);
 vi.advanceTimersByTime(60000);expect(sent.filter(e=>e.clientRef.typeId===1)).toHaveLength(1);
 p.observe({actors:[actor(70,3,false,1,1)],squads:[],monitors:[]},0);
 p.observe({actors:[actor(70,4,false,1,0)],squads:[],monitors:[]},0);
 vi.advanceTimersByTime(2000);
 expect(sent.filter(e=>e.clientRef.typeId===1).map(e=>e.clientRef.typeIndex)).toEqual([25,26]);
 p.observe({actors:[actor(70,5,true)],squads:[],monitors:[]},1);
 const before=sent.length;p.stop();vi.advanceTimersByTime(60000);expect(sent).toHaveLength(before);
});
