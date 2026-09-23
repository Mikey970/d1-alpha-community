import { BitReader } from '@blamnetwork/rsat';
import { expect, it } from 'vitest';
import { buildVenusStrikeBindingEntries, buildTowerApplySenseEntries, buildVenusStrikeEntryObjective } from './rsat/mocks/sensor-auth';
import { SquadAuth, SquadSense, PlayerObjectiveAuth, PlayerAuth } from './rsat/schemas/sensor';

it('publishes all shared physical player bindings needed by the live strike registry', () => {
  for (const slice of [0, 2, 16, 7]) {
    const entries = buildTowerApplySenseEntries(0x1234n, slice, 'venus_portal_1');
    const players = entries.filter(e => e.clientRef.bundle === 0xeaaf16e2 && e.clientRef.typeId === 12);
    expect(players.map(e => e.clientRef.typeIndex)).toEqual(Array.from({length:16}, (_, i) => i));
    for (const entry of players) {
      expect(PlayerAuth.decode(new BitReader(entry.authBody!)).key).toBe(0x1234n);
      expect(entry.authSchemaBound).toBe(true);
      expect(entry.senseSchemaBound).toBe(true);
    }
  }
});

it('binds only strike global and loaded Engineering rows without placing squads', () => {
  const plaza = buildTowerApplySenseEntries(0x1234n, 16, 'venus_portal_1');
  expect(plaza.some(e => e.clientRef.bundle === 0x517641f1)).toBe(false);
  expect(plaza.some(e => e.clientRef.bundle === 0x0a302429 && e.clientRef.typeIndex === 24)).toBe(true);
  expect(plaza.some(e => e.clientRef.bundle === 0x0a302429 && e.clientRef.typeIndex === 74)).toBe(false);
  const engineering = buildVenusStrikeBindingEntries(0x1234n, 7);
  expect(engineering.some(e => e.clientRef.bundle === 0x0a302429 && e.clientRef.typeIndex === 74)).toBe(true);
  expect(engineering.some(e => e.clientRef.bundle === 0x0a302429 && e.clientRef.typeIndex === 45)).toBe(false);
  const squad = engineering.find(e => e.clientRef.bundle === 0x0a302429 && e.clientRef.typeId === 1 && e.clientRef.typeIndex === 5)!;
  expect(SquadAuth.decode(new BitReader(squad.authBody!)).roster?.slots).toEqual([0,0,0,0]);
  expect(SquadSense.decode(new BitReader(squad.senseBody!)).roster?.slots).toEqual([0,0,0,0]);
});

it('publishes the authored Engineering entry marker without supplying a kill count', () => {
  const entry = buildVenusStrikeEntryObjective();
  const value = PlayerObjectiveAuth.decode(new BitReader(entry.authBody!));
  expect(entry.clientRef).toEqual({bundle: 0x0a302429, typeId:32, typeIndex:24});
  expect(value.unk0).toBe(1);
  expect(value.unk4).toBe(0);
  expect(value.unk5).toBe(0);
  expect(value.slots.slots[0].ref).toEqual({bundle:0x0a302429,typeId:43,typeIndex:149});
  expect(value.slots.slots[0].kind13.toString('hex')).toBe('c382d64dc3ab0e3f41ad63cf');
});
