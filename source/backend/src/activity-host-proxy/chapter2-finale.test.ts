import {afterEach,expect,it,vi} from 'vitest';
import {Chapter2Dialogue} from './chapter2-dialogue';
import {Chapter2Finale} from './chapter2-finale';
import type {SensorAuthSenseEntry} from './rsat/mocks/sensor-auth';
afterEach(()=>vi.useRealTimers());
it('waits for boss death, fresh device completion, both dialogue timelines and the actual final monitor',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];
 const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));d.enter(14);
 const f=new Chapter2Finale(d,e=>sent.push(e));
 f.bossDefeated();f.bossDefeated();vi.advanceTimersByTime(4000);
 expect(sent.filter(e=>e.clientRef.typeId===4).map(e=>e.clientRef.typeIndex)).toEqual([77]);
 const update={actors:[],squads:[],health:[],monitors:[],devices:[{index:77,position:0,revision:1,sequence:1}]};
 f.observe(update);vi.advanceTimersByTime(30000);expect(f.complete).toBe(false);
 f.observe({...update,devices:[{index:77,position:1,revision:1,sequence:2}]});vi.advanceTimersByTime(17000);
 expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex)).toContain(117);
 expect(sent.some(e=>e.clientRef.typeIndex===127)).toBe(false);
 f.observe({...update,devices:[],monitors:[{index:154,anyInside:true,allInside:true,count:1,revision:0,sequence:1}]});
 vi.advanceTimersByTime(6000);expect(f.complete).toBe(true);
 expect(sent.filter(e=>e.clientRef.typeId===5).map(e=>e.clientRef.typeIndex).slice(-2)).toEqual([117,118]);
 expect(sent.filter(e=>e.clientRef.typeIndex===127)).toHaveLength(1);f.stop();d.stop();
});
it('cancels the shutdown when the session closes',()=>{
 vi.useFakeTimers();const sent:SensorAuthSenseEntry[]=[];const d=new Chapter2Dialogue(()=>100,e=>sent.push(e));
 const f=new Chapter2Finale(d,e=>sent.push(e));f.bossDefeated();f.stop();vi.advanceTimersByTime(60000);
 expect(sent).toEqual([]);d.stop();
});
