import { EventEmitter } from 'node:events';
import { BitReader } from '@blamnetwork/rsat';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityHostProxySession } from './session';
import { ActivityHostService } from './activity-host';
import { scenarioClient } from './scenario-client';
import { SquadAuth, SquadSense } from './rsat/schemas/sensor';
import { buildTowerApplySenseEntries, buildTowerVendorActivationSenseEntries, senseEntryPayloadBits } from './rsat/mocks/sensor-auth';
import nativePopulations from './tower-npc-populations.json';

afterEach(() => vi.useRealTimers());

it('does not reset activated NPCs during same-slice refresh and stages them again on re-entry', () => {
  for (const includeAmbient of [false,true]) {
    for (const slice of [0,2,3,4]) {
      const key = (entry:any) => `${entry.clientRef.bundle}/${entry.clientRef.typeId}/${entry.clientRef.typeIndex}`;
      const active = new Set(buildTowerVendorActivationSenseEntries(slice,0,includeAmbient).map(key));
      const refresh = buildTowerApplySenseEntries(1n,slice,'city_tower_default1',false,true,includeAmbient);
      expect(refresh.length).toBeGreaterThan(0);
      for (const entry of refresh.filter(entry=>active.has(key(entry)))) {
        expect(entry.clientRef.typeId).toBe(1);
        expect(senseEntryPayloadBits(entry).slice(0,2)).toEqual([0,1]);
        expect(entry.senseBody).toBeUndefined();
      }
      const reentry = buildTowerApplySenseEntries(1n,slice,'city_tower_default1',true,true,includeAmbient);
      expect(reentry.some(entry=>active.has(key(entry)))).toBe(true);
    }
  }
});

it('stages all 78 native NPC squads and 101 named actors without duplicating named members', () => {
  const entries = [0,2,3,4].flatMap(slice => buildTowerVendorActivationSenseEntries(slice,0,true));
  const squads = entries.filter(e => e.clientRef.typeId === 1);
  const actors = entries.filter(e => e.clientRef.typeId === 2);
  expect(squads).toHaveLength(78);
  expect(actors).toHaveLength(101);
  let anonymousCount = 0;
  for (const entry of squads) {
    const row = nativePopulations.find(row => parseInt(row.bundle,16) === entry.clientRef.bundle && row.squad === entry.clientRef.typeIndex)!;
    expect(row).toBeDefined();
    const roster = SquadAuth.decode(new BitReader(entry.authBody!)).roster!.slots;
    expect(roster).toEqual(row.population);
    anonymousCount += roster.reduce((sum,n)=>sum+n,0);
    for (const id of row.actors) {
      expect(actors.some(a => a.clientRef.bundle === entry.clientRef.bundle && a.clientRef.typeIndex === id)).toBe(true);
    }
  }
  expect(anonymousCount).toBe(65);
  expect(new Set(entries.map(e=>`${e.clientRef.bundle}/${e.clientRef.typeId}/${e.clientRef.typeIndex}`)).size).toBe(entries.length);
});

it('sends decodable native auth and absolute sense for all 24 authored vendor members', () => {
  let members = 0;
  for (const [slice, count] of [[0,6],[2,7],[3,7],[4,3]]) {
    const entries = buildTowerVendorActivationSenseEntries(slice);
    expect(entries).toHaveLength(count);
    for (const entry of entries) {
      const bits = senseEntryPayloadBits(entry);
      const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
      bits.forEach((bit, i) => { bytes[i >> 3] |= bit << (7 - (i & 7)); });
      const reader = new BitReader(bytes);
      // Native 8376EBA4/836907E8: decode auth, present body.
      expect([reader.read(1), reader.read(1)]).toEqual([0n,1n]);
      const auth = SquadAuth.decode(reader);
      expect(auth.roster!.slots.every(n => n === 1)).toBe(true);
      members += auth.roster!.slots.length;
      // Sense received, absolute baseline reset, present body.
      expect([reader.read(1),reader.read(1),reader.read(1),reader.read(1)]).toEqual([1n,1n,1n,1n]);
      const sense = SquadSense.decode(reader);
      expect(sense.valid).toBe(true);
      expect(sense.roster!.slots).toEqual(auth.roster!.slots);
      expect(reader.read(32)).toBe(0n);
    }
  }
  expect(members).toBe(24);
});

function session(activity = 'city_tower_default1') {
  const socket = new EventEmitter();
  const host = new ActivityHostService();
  const manager = { bindSession: () => 'FAH', host: () => host, unbindSession: vi.fn() };
  const logger = { log:vi.fn(),warn:vi.fn(),error:vi.fn(),debug:vi.fn() };
  const value = new ActivityHostProxySession(socket as any, logger, manager as any) as any;
  value.towerAuthOpts = () => ({ scenario:scenarioClient(activity) });
  value.pushAh = vi.fn();
  value.currentSlice = 3;
  return { value, socket };
}

it('activates a directly joined Tower slice once after client auth, without refresh starvation', () => {
  vi.useFakeTimers();
  const {value,socket} = session();
  try {
    value.armTowerVendorActivation(3);
    vi.advanceTimersByTime(25_000);
    expect(value.pushAh).not.toHaveBeenCalled(); // must await client-auth
    value.scheduleTowerVendorActivation(1n);
    vi.advanceTimersByTime(10_000);
    value.armTowerVendorActivation(3); // same-slice refresh must not restart the delay
    value.scheduleTowerVendorActivation(1n);
    vi.advanceTimersByTime(10_000);
    expect(value.pushAh).toHaveBeenCalledTimes(1);
    value.armTowerVendorActivation(3);
    value.scheduleTowerVendorActivation(1n);
    vi.advanceTimersByTime(30_000);
    expect(value.pushAh).toHaveBeenCalledTimes(1);
  } finally { socket.emit('close'); }
});

it('cancels departed-slice work and never activates Tower vendors in Venus', () => {
  vi.useFakeTimers();
  const {value,socket} = session();
  try {
    value.armTowerVendorActivation(3);
    value.scheduleTowerVendorActivation(1n);
    value.currentSlice = 2;
    value.armTowerVendorActivation(2,3);
    vi.advanceTimersByTime(30_000);
    expect(value.pushAh).not.toHaveBeenCalled();
    value.scheduleTowerVendorActivation(1n);
    vi.advanceTimersByTime(20_000);
    expect(value.pushAh).toHaveBeenCalledTimes(1);
  } finally { socket.emit('close'); }
  const venus = session('venus_chapter_2');
  try {
    venus.value.armTowerVendorActivation(3);
    venus.value.scheduleTowerVendorActivation(1n);
    vi.advanceTimersByTime(30_000);
    expect(venus.value.pushAh).not.toHaveBeenCalled();
  } finally { venus.socket.emit('close'); }
});
