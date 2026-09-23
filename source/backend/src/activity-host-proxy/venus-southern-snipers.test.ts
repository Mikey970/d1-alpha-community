import { BitReader } from '@blamnetwork/rsat';
import { expect, it } from 'vitest';
import { SquadAuth } from './rsat/schemas/sensor';
import { buildVenusSouthernSniperEntries } from './rsat/mocks/sensor-auth';

it('retains host78 sniper populations and never resets native sense on refresh', () => {
  const initial = buildVenusSouthernSniperEntries(true);
  const refresh = buildVenusSouthernSniperEntries();
  const squads = initial.filter(entry => entry.clientRef.typeId === 1);
  expect(squads.map(entry => entry.clientRef.typeIndex)).toEqual([39,41,43,44,45,46,47]);
  expect(squads.map(entry => SquadAuth.decode(new BitReader(entry.authBody!)).roster.slots))
    .toEqual([[0],[0],[1],[1],[1],[1],[1]]);
  expect(initial.filter(entry => entry.clientRef.typeId === 2).map(entry => entry.clientRef.typeIndex))
    .toEqual([40,42]);
  expect(initial.filter(entry => entry.isReceivedSenseState)).toHaveLength(8);
  expect(refresh.every(entry => !entry.isReceivedSenseState && entry.senseBits === 0)).toBe(true);
  expect(refresh.map(entry => entry.authBody)).toEqual(initial.map(entry => entry.authBody));
});
