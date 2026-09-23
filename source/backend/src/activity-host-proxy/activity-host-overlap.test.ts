import { EventEmitter } from "node:events";
import { encode, encodeServerMessage } from "@blamnetwork/rsat";
import { expect, it, vi } from "vitest";
import * as characterStores from '../bungie-access-protocol/character-store';
import {JoinRequest} from './join';
import { ActivityHostManager } from "./activity-host-manager";
import { ActivityHostProxySession } from "./session";
import { ActivityHostStartupOptionsRequest, START_REQUEST_PAYLOAD_SIZE, START_REQUEST_STREAM_SIZE_OFFSET } from "./start-request";
import { ActivityHostMessageType } from "./messages";

function notification(sessionId: bigint, kind: ActivityHostMessageType, payload: Buffer) {
  const header = Buffer.alloc(17);
  header.writeBigUInt64BE(sessionId);
  header.writeUInt8(1, 8);
  header.writeUInt32BE(kind, 9);
  header.writeUInt32BE(payload.length, 13);
  return { body: Buffer.concat([header, payload]) };
}

function startBody(activityId: number) {
  const payload = Buffer.alloc(START_REQUEST_PAYLOAD_SIZE);
  const options = encodeServerMessage(1303, ActivityHostStartupOptionsRequest, {
    activityId, ipValid: false, unknown1: false,
  });
  payload.writeUInt16BE(options.length, 0);
  options.copy(payload, 2);
  payload.writeUInt16BE(0, START_REQUEST_STREAM_SIZE_OFFSET);
  return Buffer.concat([Buffer.from([3]), payload]);
}

function overlappingSessions() {
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const manager = new ActivityHostManager(logger);
  const sockets = Array.from({ length: 3 }, () => new EventEmitter());
  const sessions = sockets.map(socket => {
    const session = new ActivityHostProxySession(socket as any, logger, manager) as any;
    session.send = vi.fn();
    session.pushAh = vi.fn();
    return session;
  });
  const start = (session: any, activity: number) => {
    session.handleActivityHostManager({ msgType: 6, sequence: 1, body: startBody(activity) });
    return session.send.mock.lastCall?.[0].body.readBigUInt64BE(1);
  };
  return { manager, sockets, sessions, start, close: () => sockets.forEach(socket => socket.emit("close")) };
}

it("gives overlapping current and target public activities distinct hosts and initial entity grants", () => {
  const { sessions: [fah, current, target], start, close } = overlappingSessions();
  try {
    expect([fah.kind, current.kind, target.kind]).toEqual(["FAH", "GAH", "GAH"]);
    const currentId = start(current, 2);
    current.pushEntityIndexGrant(currentId);
    const targetId = start(target, 0);
    target.pushEntityIndexGrant(targetId);
    expect(targetId).not.toBe(currentId);
    expect(current.pushAh).toHaveBeenCalledTimes(1);
    expect(target.pushAh).toHaveBeenCalledTimes(1);
    expect(current.resolvedRoute.activityId).toBe(2);
    expect(target.resolvedRoute.activityId).toBe(0);
    target.pushEntityIndexGrant(targetId);
    expect(target.pushAh).toHaveBeenCalledTimes(1);
  } finally { close(); }
});

it("keeps target routing and allocations intact when an older public connection changes or closes", () => {
  const { manager, sockets, sessions: [, current, target], start, close } = overlappingSessions();
  try {
    const currentId = start(current, 2);
    const targetId = start(target, 0);
    const route = manager.getResolvedRoute("GAH");
    start(current, 32767);
    expect(manager.getResolvedRoute("GAH")).toBe(route);
    const freed = Buffer.alloc(1536);
    freed.writeUInt32BE(1, 0);
    current.handleFreeEntityIndices(currentId, freed);
    target.handleAllocateEntityIndices(targetId, Buffer.from([0, 0, 0, 1]));
    expect(target.pushAh.mock.lastCall[2].readUInt32BE(0)).toBe(0);
    sockets[1].emit("close");
    expect(manager.getResolvedRoute("GAH")).toBe(route);
    expect(target.resolvedRoute.activityId).toBe(0);
  } finally { close(); }
});

it("rejects notifications addressed to another host before changing the current allocation pool", () => {
  const { sessions: [, current, target], start, close } = overlappingSessions();
  try {
    const currentId = start(current, 2);
    const targetId = start(target, 0);
    const targetFree = Buffer.alloc(1536);
    targetFree.writeUInt32BE(4, 0);
    target.handleActivityHostNotification(notification(targetId, ActivityHostMessageType.FreeEntityIndices, targetFree));
    const staleFree = Buffer.alloc(1536);
    staleFree.writeUInt32BE(1, 0);
    target.handleActivityHostNotification(notification(currentId, ActivityHostMessageType.FreeEntityIndices, staleFree));
    target.handleActivityHostNotification(notification(currentId, ActivityHostMessageType.AllocateEntityIndices, Buffer.from([0, 0, 0, 1])));
    expect(target.pushAh).not.toHaveBeenCalled();
    target.handleActivityHostNotification(notification(targetId, ActivityHostMessageType.AllocateEntityIndices, Buffer.from([0, 0, 0, 1])));
    expect(target.pushAh).toHaveBeenCalledTimes(1);
    expect(target.pushAh.mock.lastCall[0]).toBe(targetId);
    expect(target.pushAh.mock.lastCall[2].readUInt32BE(0)).toBe(4);
  } finally { close(); }
});

it('rejects a delayed character join before binding it to another character save', () => {
  const original = {environment: {}};
  const titan = {environment: {}};
  const contexts = new Map([[0x200000002n, original], [0x200000003n, titan]]);
  const store = {activeContext: original, has: (id: bigint) => contexts.has(id),
    context: (id: bigint) => contexts.get(id)};
  const stub = vi.spyOn(characterStores, 'configuredCharacterStore').mockReturnValue(store as any);
  const {sessions: [session], start, close} = overlappingSessions();
  session.pushJoinState = vi.fn();
  try {
    const host = start(session, 0);
    session.send.mockClear();
    store.activeContext = titan;
    const join = (character: bigint) => session.handleActivityHostNotification(notification(host,
      ActivityHostMessageType.JoinRequest, encode(JoinRequest, {
        nonce: 1, sessionId: host,
        identity: {machine: Buffer.alloc(6), player: Buffer.alloc(8), account: 0x100000001n, character},
        auth: {unk0: 0, displayName: {chars: new Array(128).fill(0)},
          unk2: 0n, unk3: 0n, unk4: 0n, unk5: 0, unk6: Buffer.alloc(6)},
      })));
    join(0x200000003n);
    join(0x200000099n);
    expect(session.joinIdentity).toBeUndefined();
    expect(session.send).not.toHaveBeenCalled();
    expect(session.pushJoinState).not.toHaveBeenCalled();
    // Existing activity work may still complete for its original owner after
    // the menu changes selection; never retarget its save to the new owner.
    join(0x200000002n);
    expect(session.joinIdentity.character).toBe(0x200000002n);
    expect(session.send).toHaveBeenCalledTimes(1);
    expect(session.pushJoinState).toHaveBeenCalledTimes(1);
  } finally { close(); stub.mockRestore(); }
});
