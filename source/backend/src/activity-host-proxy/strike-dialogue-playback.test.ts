import {decode} from '@blamnetwork/rsat';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {SequenceAuth} from './rsat/schemas/sensor';
import {StrikeDialoguePlayback,strikeDialogueEntry,strikeDialogueTrigger} from './strike-dialogue-playback';
afterEach(()=>vi.useRealTimers());
it('uses the native Engineering arrival ID, current time and no state override',()=>{
  const entry=strikeDialogueEntry('engineeringArrival',12345);
  const native=readFileSync(resolve(process.cwd(),'../../analysis-venus-mission-20260905/client/2282_808004c5_t16_s0.bin'));
  const identity=native.readUInt32BE(0x1dc);
  expect(identity).toBe(0x05000015);
  expect(native.readUInt32BE(0x1f0)).toBe(0x80802de0);
  expect(entry.clientRef).toEqual({bundle:native.readUInt32BE(0x1d8),typeId:identity>>>24,typeIndex:identity&0xffff});
  const body=decode(SequenceAuth,entry.authBody!);
  expect(body.unk0).toBe(12345);expect(body.unk1).toBe(1);
  expect(body.pair.a.f0>>>0).toBe(0x811c9dc5);
  expect(entry.senseSchemaBound).toBe(false);
});
it('serializes clips, deduplicates a cue and cancels queued playback on departure',()=>{
  vi.useFakeTimers();const send=vi.fn(),p=new StrikeDialoguePlayback(send);
  p.enqueue('engineeringIntro');p.enqueue('engineeringIntro');p.enqueue('engineeringArrival');
  expect(send.mock.calls).toEqual([['engineeringIntro']]);
  vi.advanceTimersByTime(4730);expect(send.mock.calls).toEqual([['engineeringIntro'],['engineeringArrival']]);
  p.enqueue('engineeringComplete');p.stop();vi.runAllTimers();expect(send).toHaveBeenCalledTimes(2);
});
it('requires the exact native trigger identity and occupied bubble',()=>{
  const p=Buffer.from('1dd6d986f1600001a7e2000000020000000200000002000000020f46800000000000061d9c803145d907c5e8089811c9dc50','hex');
  const set=(start:number,n:number,value:number)=>{for(let i=0;i<n;i++){
    const at=start+i,mask=1<<(7-(at&7));p[at>>3]=(p[at>>3]&~mask)|(((value>>>(n-1-i))&1)?mask:0);
  }};
  set(310,32,0x0a302429);set(342,6,30);set(348,16,0x8000+76);
  expect(strikeDialogueTrigger(p,5)).toBe('digSiteFirst');
  expect(strikeDialogueTrigger(p,28)).toBeUndefined();
  expect(strikeDialogueTrigger(p.subarray(0,49),5)).toBeUndefined();
  set(348,16,0x8000+75);expect(strikeDialogueTrigger(p,5)).toBeUndefined();
});
