import { describe, expect, it } from 'vitest';
import { BitReader } from '@blamnetwork/rsat';
import { ActorAuth, SquadAuth, PlayerTriggerAuth } from './rsat/schemas/sensor';
import { buildVenusGatekeeperActivationEntries, buildVenusNorthernArrivalEntries } from './rsat/mocks/sensor-auth';
import { isVenusGatekeeperEntryIncident } from './venus-entry-incident';

describe('authored Gatekeeper placement', () => {
  it('creates one named boss without an anonymous duplicate and preserves the two minion populations', () => {
    const entries = buildVenusGatekeeperActivationEntries(true);
    const squads = entries.filter(e => e.clientRef.typeId === 1);
    expect(squads.map(e => e.clientRef.typeIndex)).toEqual([80,82,83]);
    expect(squads.map(e => SquadAuth.decode(new BitReader(e.authBody!)).roster?.slots)).toEqual([[0],[2],[2]]);
    const actors = entries.filter(e => e.clientRef.typeId === 2);
    expect(actors.map(e => e.clientRef.typeIndex)).toEqual([81]);
    expect(ActorAuth.decode(new BitReader(actors[0].authBody!))).toMatchObject({unk0: 1, flag3: true});
    expect(buildVenusGatekeeperActivationEntries().every(e => e.senseBody === undefined)).toBe(true);
  });
  it('enables only the packaged spawn trigger and rejects other area incidents', () => {
    const trigger = buildVenusNorthernArrivalEntries().find(e => e.clientRef.typeId === 29)!;
    expect(trigger.clientRef.typeIndex).toBe(153);
    expect(PlayerTriggerAuth.decode(new BitReader(trigger.authBody!))).toMatchObject({flag: true, unk: 0});
    // Synthetic index153 variant of the captured trigger147 emitter form, not runtime evidence.
    const event = Buffer.from('1dd6d986f1600001a7a2000000020000000200000002000000020f46800000000000061d9c803145d907c5e8099811c9dc50','hex');
    expect(isVenusGatekeeperEntryIncident(event)).toBe(true);
    event[45] = 0x93;
    expect(isVenusGatekeeperEntryIncident(event)).toBe(false);
  });
});
