import {describe, expect, it} from 'vitest';
import {BitReader, BitWriter} from '@blamnetwork/rsat';
import {SensorClientRef, SquadAuth, PlayerTriggerAuth} from './rsat/schemas/sensor';
import {buildVenusOpeningMinionEntries, buildVenusOpeningReinforcementTrigger,
  preserveVenusOpeningApply, buildVenusCaptainActivationEntries} from './rsat/mocks/sensor-auth';
import {isVenusOpeningReinforcementIncident, isVenusHeadlandsEntryIncident} from './venus-entry-incident';

// Authored host111 arrays, cross-checked against client templates3451..3456:
// one category each; 9 entry minions and 6 later reinforcement minions.
describe('Chapter2 authored opening waves', () => {
  it('encodes the two separate populations and retains native spawn regions', () => {
    const initial = buildVenusOpeningMinionEntries();
    const reinforcement = buildVenusOpeningMinionEntries(true);
    expect(initial.map(e => e.clientRef.typeIndex)).toEqual([3,6,7,8]);
    expect(reinforcement.map(e => e.clientRef.typeIndex)).toEqual([4,5]);
    expect([...initial, ...reinforcement].map(e => {
      const auth = SquadAuth.decode(new BitReader(e.authBody!));
      expect(auth.ref1).toBeUndefined(); // No Captain platform override.
      expect(e.senseBody).toBeDefined();
      expect(e.isSenseUpdateRelative).toBe(false);
      return auth.roster.slots;
    })).toEqual([[4],[3],[1],[1],[3],[3]]);
    expect(initial.map(e => SquadAuth.decode(new BitReader(e.authBody!)).ref0?.typeIndex)).toEqual([80,undefined,81,81]);
  });

  it('does not reset allocated minions or alter the Captain on refresh', () => {
    const captain = buildVenusCaptainActivationEntries();
    const initial = buildVenusOpeningMinionEntries();
    const reinforcement = buildVenusOpeningMinionEntries(true);
    const entries = [...captain, ...initial, ...reinforcement, buildVenusOpeningReinforcementTrigger()];
    const beforeTrigger = preserveVenusOpeningApply(entries, false);
    expect(initial.every(e => !beforeTrigger.includes(e))).toBe(true);
    expect(reinforcement.every(e => beforeTrigger.includes(e))).toBe(true);
    const afterTrigger = preserveVenusOpeningApply(entries, true);
    expect([...initial, ...reinforcement].every(e => !afterTrigger.includes(e))).toBe(true);
    expect(captain.every(e => afterTrigger.includes(e))).toBe(true);
    const trigger = afterTrigger.find(e => e.clientRef.typeId===29 && e.clientRef.typeIndex===35)!;
    expect(PlayerTriggerAuth.decode(new BitReader(trigger.authBody!)).flag).toBe(true);
    expect(trigger.senseBody).toBeUndefined();
  });

  it('accepts only the complete entrance reinforcement identity', () => {
    // Reuse the independently captured native137 framing/context, replacing
    // only its ref. This is a protocol fixture, not a claim of observed35 firing.
    const captured = Buffer.from('1dd6d986f1600001a7e2000000020000000200000002000000020f46800000000000061d9c803145d907c5e8089811c9dc50','hex');
    const make = (bundle: number, index: number) => {
      const writer = new BitWriter();
      for(let bit=0;bit<310;bit++)writer.writeBit((captured[bit>>3]>>(7-(bit&7)))&1);
      SensorClientRef.encode(writer,{bundle,typeId:29,typeIndex:index});
      writer.write(0x811c9dc5,32); writer.write(0,4);
      return writer.finish();
    };
    const trigger = make(0x44fb7aa2,35);
    expect(isVenusOpeningReinforcementIncident(trigger)).toBe(true);
    expect(isVenusHeadlandsEntryIncident(trigger)).toBe(false);
    for(const wrong of [captured, make(0x517641f1,35), make(0x44fb7aa2,33), trigger.subarray(1), Buffer.concat([trigger,trigger])]) {
      expect(isVenusOpeningReinforcementIncident(wrong)).toBe(false);
    }
  });
});
