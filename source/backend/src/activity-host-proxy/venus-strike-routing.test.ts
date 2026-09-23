import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVITY_BUNDLE_TAGS, activityBundleForSlice } from "../tags";
import { scenarioClient } from "./scenario-client";
import { activityNameForId } from "./activity-id";
import { BitReader } from '@blamnetwork/rsat';
import { buildTowerBinderSenseEntries, buildTowerApplySenseEntries } from './rsat/mocks/sensor-auth';
import { LifetimeAuth } from './rsat/schemas/sensor';
import patrolPending from './patrol-pending-r576.fixture.json';

const client = readFileSync(new URL("./strike-fixtures/portal-client-0184-entry9.bin", import.meta.url));
const host = readFileSync(new URL("./strike-fixtures/portal-fah-00dc-entry8.bin", import.meta.url));
const bountyClient = readFileSync(new URL("./strike-fixtures/bounty-client-0184-entry12.bin", import.meta.url));
const bountyHost = readFileSync(new URL("./strike-fixtures/bounty-fah-00dc-entry10.bin", import.meta.url));

/** Decode the native FAH's physical rows and both public/private bundle vectors. */
function nativePhysicalBundleTags(hostData = host): number[][] {
  const host = hostData;
  const count = host.readUInt32BE(0x34);
  const table = 0x38 + host.readUInt32BE(0x38) + 0x10;
  return Array.from({ length: count }, (_, i) => {
    const row = table + 12 * i;
    if (host.readUInt32BE(row + 4) === 0) return [];
    expect(host.readUInt32BE(row + 4)).toBe(1);
    const list = row + 8 + host.readUInt32BE(row + 8);
    expect(host.readUInt32BE(list + 4)).toBe(0x80800889);
    const refs: number[] = [];
    // 80800889 contains independent public/private80800534 lists.
    for (const countOffset of [0x34, 0x3c]) {
      const n = host.readUInt32BE(list + countOffset);
      if (!n) continue;
      const pointer = list + countOffset + 4;
      const items = pointer + host.readUInt32BE(pointer) + 0x10;
      expect(host.readUInt32BE(items - 12)).toBe(0x80800534);
      expect(host.readUInt32BE(items - 16)).toBe(n);
      for (let j = 0; j < n; j++) refs.push(host.readUInt32BE(items + 4 * j));
    }
    return refs;
  });
}

describe("native Venus strike routing", () => {
  it('initializes the captured Patrol sensors without Chapter2 mission globals', () => {
    const entries = buildTowerApplySenseEntries(0x1234n, patrolPending.slice, 'venus_bounty_1');
    const key = (ref: {bundle:number;typeId:number;typeIndex:number}) => `${ref.bundle}/${ref.typeId}/${ref.typeIndex}`;
    const patrol = entries.filter(e => e.clientRef.bundle === 0x27dd7734);
    expect(patrol.map(e=>key(e.clientRef)).sort()).toEqual(patrolPending.pending.map(key).sort());
    expect(patrol.every(e=>e.authBody !== null)).toBe(true);
    expect(entries.some(e=>e.clientRef.bundle === 0x517641f1)).toBe(false);
  });
  it('publishes the authored initial phase in both the join and refresh Lifetime state', () => {
    expect(host.readUInt32BE(0x40)).toBe(4);
    for (const entries of [buildTowerBinderSenseEntries(0x1234n, 'venus_portal_1'),
      buildTowerApplySenseEntries(0x1234n, 16, 'venus_portal_1')]) {
      const lifetime = entries.find(e => e.clientRef.typeId === 16)!;
      const state = LifetimeAuth.decode(new BitReader(lifetime.authBody!));
      expect(state.state).toBe(2);
      expect(state.phaseIndex).toBe(3);
      expect(state.phaseHash).toBe(host.readUInt32BE(0x50));
      expect(state.field4).toBe(21);
    }
    for (const activity of ['venus_chapter_2', 'city_tower_default1']) {
      const entry = buildTowerBinderSenseEntries(0x1234n, activity).find(e => e.clientRef.typeId === 16)!;
      const state = LifetimeAuth.decode(new BitReader(entry.authBody!));
      expect([state.phaseIndex, state.phaseHash, state.field4]).toEqual([3, 0x45bc13ac, 21]);
    }
  });
  it("uses the actual portal wrapper, checksums, initial bubble and empty rows", () => {
    expect(activityNameForId(4)).toBe("venus_portal_1");
    const portal = scenarioClient("venus_portal_1")!;
    expect(portal.tag).toBe(0x80b08009);
    expect(portal.familyChecksum).toBe(client.readUInt32BE(4));
    expect(portal.privateChecksum).toBe(client.readUInt32BE(8));
    expect(portal.publicChecksum).toBe(client.readUInt32BE(12));
    expect(portal.initialBubble).toBe(host.readUInt32BE(0x1c));
    expect(portal.bubbleCount).toBe(client.readUInt32BE(0x2c));
    const table = 0x30 + client.readUInt32BE(0x30) + 0x10;
    const empty = Array.from({length: portal.bubbleCount}, (_, i) => i)
      .filter(i => client.readUInt32BE(table + 12 * i + 4) === 0);
    expect(portal.emptyBubbles).toEqual(empty);
    expect(portal.privateChecksum).not.toBe(scenarioClient("venus_chapter_2")!.privateChecksum);
  });

  it("matches all30 native physical bundle lists without reusing Chapter2 private encounters", () => {
    nativePhysicalBundleTags().forEach((tags, bubble) => {
      // EAAF16E2 is the separately initialized shared-player bundle.
      const physical = tags.filter(tag => tag !== 0x809b801b);
      expect(physical.length).toBeLessThanOrEqual(1);
      const routed = activityBundleForSlice("venus_portal_1", bubble);
      expect(routed?.tag).toBe(physical[0]);
      if (physical.length) expect(ACTIVITY_BUNDLE_TAGS.some(t => t.tag === physical[0])).toBe(true);
    });
    expect(activityBundleForSlice("venus_portal_1", 7)?.bundle).toBe(0x97438d09);
    expect(activityBundleForSlice("venus_portal_1", 5)?.bundle).toBe(0x5de7d8e2);
    expect(activityBundleForSlice("venus_portal_1", 28)?.bundle).toBe(0x9cf47ad5);
  });

  it("uses the native bounty client and physical bundles while preserving Chapter2", () => {
    expect(scenarioClient("venus_chapter_2")?.tag).toBe(0x80b08006);
    const bounty = scenarioClient("venus_bounty_1")!;
    expect(bounty.tag).toBe(0x80b0800c);
    expect(bounty.familyChecksum).toBe(bountyClient.readUInt32BE(4));
    expect(bounty.privateChecksum).toBe(bountyClient.readUInt32BE(8));
    expect(bounty.publicChecksum).toBe(bountyClient.readUInt32BE(12));
    expect(bounty.initialBubble).toBe(bountyHost.readUInt32BE(0x1c));
    expect(bounty.bubbleCount).toBe(bountyClient.readUInt32BE(0x2c));
    const table = 0x30 + bountyClient.readUInt32BE(0x30) + 0x10;
    expect(bounty.emptyBubbles).toEqual(Array.from({length:bounty.bubbleCount},(_,i)=>i)
      .filter(i=>bountyClient.readUInt32BE(table+12*i+4)===0));
    nativePhysicalBundleTags(bountyHost).forEach((tags, bubble) => {
      const physical = tags.filter(tag => tag !== 0x809b801b);
      expect(physical.length).toBeLessThanOrEqual(1);
      expect(activityBundleForSlice("venus_bounty_1", bubble)?.tag).toBe(physical[0]);
    });
    expect(activityBundleForSlice("venus_chapter_2", 8)?.bundle).toBe(0x44fb7aa2);
    expect(activityBundleForSlice("venus_chapter_2", 14)?.bundle).toBe(0xee5b8c2a);
    expect(activityBundleForSlice("venus_chapter_2", 23)?.bundle).toBe(0x0a6d9003);
  });
});
