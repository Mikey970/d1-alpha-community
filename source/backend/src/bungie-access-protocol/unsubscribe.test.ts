import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { BungieAccessProtocolSession } from "./session";
import { BapMessageType } from "./constants";
import { BungieCodec } from "./codec";

function createSession() {
  const socket = new EventEmitter();
  const session = new BungieAccessProtocolSession(socket as any, {
    log: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
  }) as any;
  const sent: any[] = [];
  session.send = (message: any) => sent.push(message);
  return { socket, session, sent };
}

function unsubscribe(session: any, family: number, root: bigint) {
  const body = Buffer.alloc(9);
  body[0] = family;
  body.writeBigUInt64BE(root, 1);
  session.handleMessage({ msgType: BapMessageType.ClientToBapUnsubscribeRequest, sequence: 54, body });
}

describe("native BAP unsubscribe lifecycle", () => {
  it("retains self but removes the peer subscription during native logout and relogin", () => {
    const { socket, session, sent } = createSession();
    try {
      session.inventorySubscriptions.set(4, 0x100000001n);
      session.inventorySubscriptions.set(0, 0x100000001n);
      const characterRequest = (hex: string) => session.handleMessage({
        msgType: BapMessageType.ClientToWorldServerRequest, sequence: 65, body: Buffer.from(hex, "hex"),
      });
      characterRequest("01f900");
      // Captured native logout cancels roster and peer, retaining self.
      unsubscribe(session, 2, 0x100000001n);
      unsubscribe(session, 0, 0x100000001n);
      sent.length = 0;
      characterRequest("01f8000000020000000200");
      expect(sent.map(message => message.msgType)).toEqual([
        BapMessageType.QueuezToClientUpdateNotification,
        BapMessageType.ClientToWorldServerResponse,
      ]);
      expect([...session.inventorySubscriptions]).toEqual([[4, 0x100000001n]]);
      expect(session.selectedCharacterSoid).toBe(0x200000002n);
      sent.length = 0;
      session.handleMessage({ msgType: BapMessageType.ClientToBapSubscriptionRequest,
        sequence: 66, body: Buffer.from("000000000100000001", "hex") });
      expect(sent.some(message => message.msgType === BapMessageType.QueuezToClientUpdateNotification)).toBe(true);
    } finally { socket.emit("close"); }
  });

  it("matches both family and root, preserves other sessions, and acknowledges duplicate requests", () => {
    const a = createSession();
    const b = createSession();
    try {
      a.session.inventorySubscriptions.set(4, 0x100000001n);
      a.session.inventorySubscriptions.set(3, 0x200000002n);
      b.session.inventorySubscriptions.set(4, 0x100000001n);
      unsubscribe(a.session, 4, 0x100000002n);
      expect(a.session.inventorySubscriptions.size).toBe(2);
      unsubscribe(a.session, 4, 0x100000001n);
      unsubscribe(a.session, 4, 0x100000001n);
      expect([...a.session.inventorySubscriptions]).toEqual([[3, 0x200000002n]]);
      expect(b.session.inventorySubscriptions.size).toBe(1);
      expect(a.sent).toHaveLength(3);
      const frame = new BungieCodec().encode(a.sent[2]);
      // Native response type 15, original sequence, normal status, no payload.
      expect(frame.toString("hex")).toBe("010200000008000f0000003600c8");
    } finally { a.socket.emit("close"); b.socket.emit("close"); }
  });

  it("rejects truncated and trailing bodies without cancelling any subscription", () => {
    const { socket, session, sent } = createSession();
    try {
      session.inventorySubscriptions.set(4, 0x100000001n);
      for (const length of [0, 8, 10]) session.handleMessage({
        msgType: BapMessageType.ClientToBapUnsubscribeRequest, sequence: 54, body: Buffer.alloc(length),
      });
      expect(session.inventorySubscriptions.size).toBe(1);
      expect(sent).toHaveLength(0);
    } finally { socket.emit("close"); }
  });
});
