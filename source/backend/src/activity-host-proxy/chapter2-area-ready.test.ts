import {afterEach,expect,it,vi} from 'vitest';
import {Chapter2AreaReady} from './chapter2-area-ready';
import {parseClientAuth} from './client-auth';
afterEach(()=>vi.useRealTimers());
it('does not let later preloads starve the occupied encounter',()=>{
 vi.useFakeTimers();const apply=vi.fn();const gate=new Chapter2AreaReady(apply);
 gate.observe(8);vi.advanceTimersByTime(4000);
 const late=parseClientAuth(Buffer.from('a0b0','hex'))!;expect(late.transition?.state).toBe(2);
 gate.observe(8,late.transition?.state===0);
 vi.advanceTimersByTime(5999);expect(apply).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(apply).toHaveBeenCalledExactlyOnceWith(8);
 gate.observe(8,true);vi.advanceTimersByTime(20000);expect(apply).toHaveBeenCalledTimes(1);gate.stop();
});
it('applies immediately on native transition completion and only once per visit',()=>{
 vi.useFakeTimers();const apply=vi.fn();const gate=new Chapter2AreaReady(apply);
 gate.observe(21);vi.advanceTimersByTime(1000);gate.observe(21,true);
 expect(apply).toHaveBeenCalledExactlyOnceWith(21);
 gate.observe(21);vi.advanceTimersByTime(20000);expect(apply).toHaveBeenCalledTimes(1);gate.stop();
});
it('cancels obsolete arrivals and all queued work on activity closure',()=>{
 vi.useFakeTimers();const apply=vi.fn();const gate=new Chapter2AreaReady(apply);
 gate.observe(8);vi.advanceTimersByTime(7000);gate.leave();gate.observe(16);
 vi.advanceTimersByTime(3000);expect(apply).not.toHaveBeenCalled();gate.stop();
 vi.advanceTimersByTime(20000);expect(apply).not.toHaveBeenCalled();
});
it('uses the same delivery gate for landing, Captain, fluids, warpgates and boss areas',()=>{
 vi.useFakeTimers();const visited:number[]=[];const gate=new Chapter2AreaReady(s=>visited.push(s));
 for(const area of [16,8,21,10,23,14]){gate.observe(area);vi.advanceTimersByTime(10000);}
 expect(visited).toEqual([16,8,21,10,23,14]);gate.stop();
});
