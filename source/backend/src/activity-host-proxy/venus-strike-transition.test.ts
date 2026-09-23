import { expect, it } from 'vitest';
import captures from './strike-fixtures/r418-engineering-requests.json';
import digSiteCaptures from './strike-fixtures/r434-dig-site-requests.json';
import { parseClientAuth } from './client-auth';
import { requestedStrikeBubble } from './venus-strike-transition';
import { buildReplicateMembershipRsat, parseReplicateMembership } from './rsat/mocks';

it('accepts the actual later Dig Site requests without bypassing destination validation', () => {
  expect(digSiteCaptures.length).toBeGreaterThanOrEqual(2);
  for (const capture of digSiteCaptures) {
    const auth = parseClientAuth(Buffer.from(capture.payload, 'hex'))!;
    expect(requestedStrikeBubble(auth, 'venus_portal_1', 7)).toBe(5);
    expect(requestedStrikeBubble(auth, 'venus_portal_1', 5)).toBeUndefined();
    const packet = buildReplicateMembershipRsat({machine:Buffer.from('7c1e52584c55','hex'),player:Buffer.alloc(8),account:1n,character:2n}, {
      bubbleCount:30,emptyBubbles:[11,15,20,22],initialBubble:5,anchorBubble:7,
      regionTokens:{5:auth.transition!.kind!,7:4},
    });
    const membership = parseReplicateMembership(packet)!;
    const rows = membership.pahRegions!.table.rows;
    const matching = rows.filter(r=>r.regionId===40 && r.public.peerSlots.markers[0]===capture.kind);
    expect(matching).toHaveLength(1);
    expect(matching[0].ambassador.opcode).toBe(1);
    expect(rows.filter(r=>r.regionId===56).map(r=>r.public.peerSlots.markers[0])).toEqual([4]);
    expect(membership.pahRegions!.unknown1.a).toBe(0);
    for (const state of [-1, 0, 5, undefined]) {
      const invalid = structuredClone(auth);
      invalid.transition!.state = state;
      expect(requestedStrikeBubble(invalid, 'venus_portal_1', 7)).toBeUndefined();
    }
    for (const change of [{destination:-1}, {secondaryDestination:56}, {token:1}, {state:1}]) {
      const invalid = structuredClone(auth);
      Object.assign(invalid.transition!.requested!, change);
      expect(requestedStrikeBubble(invalid, 'venus_portal_1', 7)).toBeUndefined();
    }
  }
});

it('answers the real recorded Engineering request with assignment while retaining the occupied bubble', () => {
  expect(captures.length).toBeGreaterThanOrEqual(2);
  for (const capture of captures) {
    const auth = parseClientAuth(Buffer.from(capture.payload, 'hex'));
    const bubble = requestedStrikeBubble(auth, 'venus_portal_1', 16);
    expect(bubble).toBe(7);
    const identity = {machine:Buffer.from('7c1e52584c55','hex'), player:Buffer.alloc(8), account:1n, character:2n};
    const packet = buildReplicateMembershipRsat(identity, {
      bubbleCount:30, emptyBubbles:[11,15,20,22], initialBubble:bubble, anchorBubble:16,
    });
    const state = parseReplicateMembership(packet)!;
    const rows = state.pahRegions!.table.rows;
    expect(rows.filter(row => row.regionId === 56).map(row => row.public.peerSlots.markers[0])).toEqual([1,2,3,4,5,6,7,8]);
    expect(rows.filter(row => row.regionId === 128).length).toBe(8);
    const assigned = rows.filter(row => row.ambassador.opcode !== 0);
    expect(assigned).toHaveLength(1);
    expect(assigned[0].regionId).toBe(56);
    expect(state.pahRegions!.unknown1.a).toBe(0); // no synthetic teleport
    expect(requestedStrikeBubble(auth, 'venus_portal_1', 7)).toBeUndefined();
    expect(requestedStrikeBubble(auth, 'venus_chapter_2', 16)).toBeUndefined();
    for (const destination of [-1, 57, 11<<3, 30<<3]) {
      const invalid = structuredClone(auth)!;
      invalid.transition!.requested!.destination = destination;
      invalid.transition!.requested!.secondaryDestination = destination;
      expect(requestedStrikeBubble(invalid, 'venus_portal_1', 16)).toBeUndefined();
    }
  }
});
