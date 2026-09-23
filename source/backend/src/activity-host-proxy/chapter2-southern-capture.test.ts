import {afterEach,expect,it,vi} from 'vitest';
import {Chapter2Dialogue} from './chapter2-dialogue';
import {readVenusGateSense,VenusGateProgress} from './venus-gate-progress';
import packets from './r545-southern-gate-monitor.fixture.json';
const packet=(line:number)=>Buffer.from(packets.find(p=>p.line===line)!.hex,'hex');
afterEach(()=>vi.useRealTimers());

it('preserves live gates in the captured coalesced wave packet and credits the later real kill once',()=>{
  const progress=new VenusGateProgress();
  expect(readVenusGateSense(packet(4294))?.actors).toHaveLength(4);
  expect(progress.observe(packet(4294))).toBe(false);
  expect(progress.observe(packet(5611))).toBe(true);
  expect(progress.count).toBe(1);
  expect(progress.observe(packet(5611))).toBe(false);
  expect(progress.defeatedActors).toEqual([72]);
});

it('requests 52 only during the gate objective using current native occupancy, and deduplicates reentry',()=>{
  vi.useFakeTimers();const spoken:number[]=[];
  const d=new Chapter2Dialogue(()=>100,e=>{if(e.clientRef.typeId===5)spoken.push(e.clientRef.typeIndex);});
  d.enter(23);d.southernSense(readVenusGateSense(packet(4260)));
  expect(spoken).toEqual([]);
  d.southernSense(readVenusGateSense(packet(4275)));d.device();vi.advanceTimersByTime(3000);
  expect(spoken).toEqual([51]);
  d.southernSense(readVenusGateSense(packet(4260))); // stale inside after newer outside
  expect(spoken).toEqual([51]);
  d.southernSense(readVenusGateSense(packet(4936)));
  expect(spoken).toEqual([51,52]);
  d.southernSense(readVenusGateSense(packet(4936)));vi.advanceTimersByTime(3000);
  expect(spoken).toEqual([51,52]);d.stop();
});

it('uses the authored eight seconds from two-gate credit, including time spent behind another line',()=>{
  vi.useFakeTimers();const spoken:number[]=[];
  const d=new Chapter2Dialogue(()=>100,e=>{if(e.clientRef.typeId===5)spoken.push(e.clientRef.typeIndex);});
  d.enter(23);d.device();d.gates(2);
  vi.advanceTimersByTime(7999);expect(spoken).toEqual([51]);
  vi.advanceTimersByTime(1);expect(spoken).toEqual([51,53]);d.stop();
});
