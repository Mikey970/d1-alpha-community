import {expect, it, vi} from 'vitest';
import {ActivityHostProxySession} from './session';
import {Chapter2Dialogue} from './chapter2-dialogue';
import {BitWriter} from '@blamnetwork/rsat';
import {SensorClientRef} from './rsat/schemas/sensor';

/** Native occupied-area refresh: counter word >= 3, then 0x80000000 | bubble. */
function stateRefresh(bubble: number): Buffer {
  const payload = Buffer.alloc(8);
  payload.writeUInt32BE(5, 0);
  payload.writeUInt32BE((0x8000_0000 | bubble) >>> 0, 4);
  return payload;
}

/** Exact captured DD6D986F trigger-incident framing. */
function incident(index: number): Buffer {
  const w = new BitWriter(512);
  w.write(1, 4);
  w.write(0xdd6d_986f, 32);
  while (w.bitCount < 310) w.writeBit(0);
  SensorClientRef.encode(w, {bundle: 0x5176_41f1, typeId: 29, typeIndex: index});
  w.write(0x811c_9dc5, 32);
  w.write(0, 4);
  return w.finish();
}

function chapter2Session(sent: number[]) {
  const s: any = Object.create(ActivityHostProxySession.prototype);
  s.logger = {log: vi.fn(), warn: vi.fn(), error: vi.fn()};
  s.kind = 'FAH';
  s.closed = false;
  s.currentSlice = 16;
  s.chapter2OccupiedSlice = 16;
  s.strikeRegionTokens = {};
  s.strikeDialogue = undefined;
  s.strikeDialogueAuth = new Map();
  s.strikeCheckpoint = {observeOccupiedRefresh: vi.fn()};
  s.strikeResume = {observeOccupied: vi.fn(), enabled: false};
  s.raidPreview = {observeOccupied: vi.fn(), enabled: false};
  s.calderaInsertion = {observeOccupied: vi.fn(), enabled: false};
  s.venusCaptainProgress = {resetEncounter: vi.fn(), complete: false};
  s.towerAuthOpts = () => ({scenario: {
    activityName: 'venus_chapter_2', bubbleCount: 30,
    emptyBubbles: [11, 15, 20, 22], initialBubble: 16,
  }});
  s.activityStateSent = true;
  s.activityTicks = () => 100;
  for (const name of ['ensureVenusStrikeEngineeringTrash', 'stopVenusVexActivation',
    'pushEntityIndexGrant', 'pushMembership', 'pushActivityGlobals', 'pushSensorAuthApply',
    'pushJoinState', 'pushAh', 'scheduleInitialSliceRecovery', 'applyChapter2OccupiedArea',
    'stopInitialSliceRecovery']) s[name] = vi.fn();
  // Record only what the dialogue layer asks the native client to play.
  s.chapter2Dialogue = new Chapter2Dialogue(() => 100, (entry) => {
    if (entry.clientRef.typeId === 5) sent.push(entry.clientRef.typeIndex);
  });
  s.enterChapter2Dialogue = (_id: bigint, slice: number) => s.chapter2Dialogue.enter(slice);
  return s;
}

it('adopts the native registry refresh as the occupied region when no client-auth delta follows', () => {
  const s = chapter2Session([]);
  // Native sends transition.current once on landing, then never again.
  s.handleStateRefresh(1n, stateRefresh(8));
  expect(s.currentSlice).toBe(8);
  expect(s.chapter2OccupiedSlice).toBe(8);
  // Agreement restored, so the area may initialize instead of being gated shut.
  expect(s.logger.error).not.toHaveBeenCalled();
  expect(s.logger.warn).not.toHaveBeenCalled();
});

it('keeps the Chapter 2 dialogue ladder advancing past the opening line', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const s = chapter2Session(played);
  s.chapter2Dialogue.enter(16);
  expect(played).toEqual([5]);
  // Trigger 134 arms only once the opening line has finished playing.
  vi.advanceTimersByTime(14_000);

  // Walking to the Captain produces a registry refresh but no transition.current.
  s.handleStateRefresh(1n, stateRefresh(8));
  s.enterChapter2Dialogue(1n, s.chapter2OccupiedSlice);

  // Before the fix the slice was still pinned to 16, so this incident was
  // dropped and every later line with it. The opening must not replay either.
  s.chapter2Dialogue.incident(incident(134));
  expect(played).toEqual([5, 11]);
  s.chapter2Dialogue.stop();
  vi.useRealTimers();
});

it('plays the Captain line from arrival state when the native never reports 134', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(16);
  vi.advanceTimersByTime(14_000); // opening line finishes, 134 arms
  expect(played).toEqual([5]);
  // Still in the landing area: the line must not play early.
  vi.advanceTimersByTime(60_000);
  expect(played).toEqual([5]);
  // Arriving at the Captain makes the trigger reachable.
  d.enter(8);
  vi.advanceTimersByTime(19_000);
  expect(played).toEqual([5]);
  vi.advanceTimersByTime(2_000);
  expect(played).toEqual([5, 11]);
  d.stop();
  vi.useRealTimers();
});

it('lets a real native incident win and does not replay it from the fallback', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(16);
  vi.advanceTimersByTime(14_000);
  d.enter(8);
  d.incident(incident(134));
  expect(played).toEqual([5, 11]);
  // The pending fallback must not queue line 11 a second time.
  vi.advanceTimersByTime(120_000);
  expect(played).toEqual([5, 11]);
  d.stop();
  vi.useRealTimers();
});

it('cancels pending fallbacks when the session closes', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(16);
  vi.advanceTimersByTime(14_000);
  d.enter(8);
  d.stop();
  vi.advanceTimersByTime(120_000);
  expect(played).toEqual([5]);
  vi.useRealTimers();
});

it('does not play the Headlands line beside the dead Captain', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(16);
  vi.advanceTimersByTime(14_000);
  d.enter(8);
  vi.advanceTimersByTime(30_000); // line 11 plays here
  expect(played).toEqual([5, 11]);
  // phase01 arms 138 before Headlands, while the player is still at slice 8.
  d.phaseOne();
  vi.advanceTimersByTime(120_000);
  expect(played).toEqual([5, 11]);
  // It belongs to the Headlands and plays on arriving there.
  d.enter(10);
  vi.advanceTimersByTime(21_000);
  expect(played).toEqual([5, 11, 21]);
  d.stop();
  vi.useRealTimers();
});

it('still lets a native 138 incident satisfy from the approach', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(21);
  d.phaseOne();
  d.incident(incident(138));
  expect(played).toEqual([21]);
  d.stop();
  vi.useRealTimers();
});

it('retires the half-way sample line once the set is already complete', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(10);
  vi.advanceTimersByTime(21_000); // Headlands arrival line 21 is playing
  expect(played).toEqual([21]);
  // Player collects straight through 5 to 10 while that line is still speaking.
  d.fluids(5);
  d.fluids(10);
  vi.advanceTimersByTime(60_000);
  // Both half-way progress and the instruction to collect are now obsolete.
  expect(played).toEqual([21, 13]);
  d.stop();
  vi.useRealTimers();
});

it('still plays the half-way line when the player is genuinely half way', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(10);
  vi.advanceTimersByTime(21_000);
  d.fluids(5);
  vi.advanceTimersByTime(18_000); // identification, instruction, then progress
  expect(played).toEqual([21, 22, 12]);
  d.fluids(10);
  vi.advanceTimersByTime(60_000);
  expect(played).toEqual([21, 22, 12, 13]);
  d.stop();
  vi.useRealTimers();
});

it('does not narrate the Southern encounter beats off the arrival timer', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(23);
  // Before the fix all four (67, 68, 49, 50) spoke within twenty seconds,
  // describing a device test and Fallen that had not happened.
  vi.advanceTimersByTime(300_000);
  expect(played).toEqual([]);
  // The native trigger is what releases the line.
  d.incident(incident(142));
  vi.advanceTimersByTime(10_000);
  expect(played).toEqual([50]);
  d.stop();
  vi.useRealTimers();
});

it('drops the two-gate line if all four gates fall inside its pre-roll', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(23);
  vi.advanceTimersByTime(120_000); // arrival set drains
  const afterArrival = [...played];
  d.gates(2);
  vi.advanceTimersByTime(2_000); // still inside 53's 8s pre-roll
  d.gates(4);
  vi.advanceTimersByTime(60_000);
  expect(played).toEqual([...afterArrival, 55]);
  d.stop();
  vi.useRealTimers();
});

it('speaks the post-Captain line on the authored loot timeout, not in the opening', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(16);
  vi.advanceTimersByTime(14_000);
  // Storage order is 5,6,11 — 6 must never join the opening exchange.
  expect(played).toEqual([5]);
  d.enter(8);
  d.incident(incident(134));
  vi.advanceTimersByTime(12_000);
  expect(played).toEqual([5, 11]);
  d.captainDefeated();
  vi.advanceTimersByTime(119_000);
  expect(played).toEqual([5, 11]);
  vi.advanceTimersByTime(2_000);
  expect(played).toEqual([5, 11, 6]);
  d.stop();
  vi.useRealTimers();
});

it('runs the boss chain 114 then 115 then 116 in authored order', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(14);
  vi.advanceTimersByTime(30_000); // Northern arrival line 113 lands first
  expect(played).toEqual([113]);
  d.bossGates();          // ch2m4_kill_gates complete
  d.gatekeeperSpawned();  // gatekeeper_spawn, worker waits for alive
  vi.advanceTimersByTime(60_000);
  expect(played).toEqual([113, 114, 115, 116]);
  d.stop();
  vi.useRealTimers();
});

it('does not start the boss chain outside the Northern bubble', () => {
  vi.useFakeTimers();
  const played: number[] = [];
  const d = new Chapter2Dialogue(() => 100, (e) => {
    if (e.clientRef.typeId === 5) played.push(e.clientRef.typeIndex);
  });
  d.enter(23);
  d.gatekeeperSpawned();
  vi.advanceTimersByTime(60_000);
  expect(played).toEqual([]);
  d.stop();
  vi.useRealTimers();
});

it('does not treat an empty bubble as an occupied region', () => {
  const s = chapter2Session([]);
  s.handleStateRefresh(1n, stateRefresh(11));
  expect(s.currentSlice).toBe(11);
  expect(s.chapter2OccupiedSlice).toBeUndefined();
});

it('leaves non-Chapter-2 activities on the client-auth receipt alone', () => {
  const s = chapter2Session([]);
  s.towerAuthOpts = () => ({scenario: {
    activityName: 'venus_portal_1', bubbleCount: 30, initialBubble: 16,
  }});
  s.handleStateRefresh(1n, stateRefresh(8));
  expect(s.currentSlice).toBe(8);
  expect(s.chapter2OccupiedSlice).toBe(16);
});
