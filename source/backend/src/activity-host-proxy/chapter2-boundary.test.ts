import {expect, it} from 'vitest';
import captures from './strike-fixtures/r537-chapter2-boundaries.json';
import {parseClientAuth} from './client-auth';
import {requestedChapter2Bubble, requestedStrikeBubble} from './venus-strike-transition';
import {buildReplicateMembershipRsat, parseReplicateMembership} from './rsat/mocks';

it('serves the actual r537 boundary requests without moving the player', () => {
  for (const capture of captures) {
    const auth = parseClientAuth(Buffer.from(capture.payload, 'hex'))!;
    const bubble = requestedChapter2Bubble(auth, 'venus_chapter_2', 8)!;
    expect(bubble).toBe(capture.line === 806 ? 16 : 21);
    const packet = buildReplicateMembershipRsat({machine:Buffer.from('7c1e52584c55','hex'),
      player:Buffer.alloc(8),account:1n,character:2n}, {
      bubbleCount:30,emptyBubbles:[11,15,20,22],initialBubble:bubble,anchorBubble:8,
      regionTokens:{8:2,[bubble]:auth.transition!.kind!},
      preserveRegionTokenRows:true,
    });
    const membership = parseReplicateMembership(packet)!;
    const rows = membership.pahRegions!.table.rows;
    expect(rows.filter(row=>row.regionId === bubble*8 && row.ambassador.opcode === 1)).toHaveLength(1);
    expect(rows.some(row=>row.regionId === 64)).toBe(true);
    expect(membership.pahRegions!.unknown1.a).toBe(0);
    expect(requestedStrikeBubble(auth, 'venus_chapter_2', 8)).toBeUndefined();
    expect(requestedChapter2Bubble(auth, 'venus_portal_1', 8)).toBeUndefined();
  }
});

it('retains active areas and local token coverage throughout Chapter 2, including revisits', () => {
  const identity = {machine:Buffer.from('7c1e52584c55','hex'), player:Buffer.alloc(8),account:1n,character:2n};
  const empty = [11,15,20,22];
  const active = Array.from({length:30},(_,i)=>i).filter(i=>!empty.includes(i));
  for (const bubble of [16,8,7,10,23,14,8,16]) {
    for (const token of [1,2,9,255]) {
      const membership = parseReplicateMembership(buildReplicateMembershipRsat(identity, {
        bubbleCount:30, emptyBubbles:empty, initialBubble:bubble, anchorBubble:16,
        regionTokens:{16:1,8:2,[bubble]:token}, preserveRegionTokenRows:true,
      }))!;
      const rows = membership.pahRegions!.table.rows;
      expect(rows).toHaveLength(40);
      expect([...new Set(rows.filter(row=>row.regionId>=0).map(row=>row.regionId>>>3))].sort((a,b)=>a-b)).toEqual(active);
      const local = rows.filter(row=>row.regionId===bubble*8);
      for (const expected of [1,2,3,4,5,6,7,8,token]) {
        expect(local.some(row=>row.public.peerSlots.markers[0]===expected)).toBe(true);
      }
      const assigned = rows.filter(row=>row.ambassador.opcode!==0);
      expect(assigned).toHaveLength(1);
      expect(assigned[0].regionId).toBe(bubble*8);
      expect(assigned[0].public.peerSlots.markers[0]).toBe(token);
      expect(membership.pahRegions!.unknown1.a).toBe(0);
    }
  }
});

it('rejects malformed, cancelled, empty, and already-occupied destinations', () => {
  const auth = parseClientAuth(Buffer.from(captures[0].payload, 'hex'))!;
  expect(requestedChapter2Bubble(auth, 'venus_chapter_2', 21)).toBeUndefined();
  for (const destination of [-1,169,11*8,30*8]) {
    const invalid = structuredClone(auth);
    invalid.transition!.requested!.destination = destination;
    invalid.transition!.requested!.secondaryDestination = destination;
    expect(requestedChapter2Bubble(invalid,'venus_chapter_2',8)).toBeUndefined();
  }
  for (const changes of [{secondaryDestination:128},{token:1},{state:1}]) {
    const invalid = structuredClone(auth);
    Object.assign(invalid.transition!.requested!,changes);
    expect(requestedChapter2Bubble(invalid,'venus_chapter_2',8)).toBeUndefined();
  }
});
