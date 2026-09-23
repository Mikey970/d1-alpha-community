import {expect,it} from 'vitest';
import {BitReader,BitWriter} from '@blamnetwork/rsat';
import {chapter2SequenceEntry,chapter2TriggerEntry} from './chapter2-dialogue';
import {buildVenusPlayerObjectiveEntry,senseEntryPayloadBits} from './rsat/mocks/sensor-auth';
import {PlayerObjectiveAuth,PlayerTriggerAuth,SequenceAuth} from './rsat/schemas/sensor';

// r542 live capture: all three headers had initialPending(+18)=1. Native
// 8376EC44..ED74 diverts relative Auth to scratch; 8376F57C..F5BC clears
// pending only after accepted full Auth. The baseline bit is independent
// from 836907E8's following Option<T> bit and from Sense framing.
it('initializes the three captured pending bindings and preserves their intended Auth',()=>{
  const cases = [
    [buildVenusPlayerObjectiveEntry(7,1),PlayerObjectiveAuth,'unk0',1],
    [chapter2SequenceEntry(5,900,true),SequenceAuth,'unk1',1],
    [chapter2TriggerEntry(134,900),PlayerTriggerAuth,'flag',true],
  ] as const;
  for(const [entry,schema,field,value] of cases){
    const bits=senseEntryPayloadBits(entry);const w=new BitWriter(2048);
    bits.forEach(bit=>w.writeBit(bit));const r=new BitReader(w.finish());
    expect(r.readBit()).toBe(1); // Full baseline, not a relative update.
    expect(r.readBit()).toBe(1); // Body follows the baseline initialization.
    expect((schema.decode(r) as any)[field]).toBe(value);
    expect(r.bitPos).toBe(bits.length);
  }
});

it('keeps full Auth framing independent from existing relative and Sense encoding',()=>{
  const entry=chapter2SequenceEntry(5,900,true);
  const full=senseEntryPayloadBits(entry);
  const relative=senseEntryPayloadBits({...entry,fullAuthState:false});
  expect(relative[0]).toBe(0);
  expect(full.slice(1)).toEqual(relative.slice(1));
});
