import { describe, expect, it } from "vitest";
import { BungieCodec, MAX_BAP_FRAME_BYTES } from "./codec";
import { BapMessageType } from "./constants";

function innerOf(frame: Buffer): Buffer {
  const length = frame.readUInt32BE(2);
  return frame.subarray(6, 6 + length);
}

describe("BungieCodec encode headers", () => {
  it("uses the 32-byte service_activity header for type 100", () => {
    const body = Buffer.from(
      "0100000000000000010000000400000004aabbccdd",
      "hex"
    );
    const codec = new BungieCodec();
    const inner = innerOf(
      codec.encode({
        msgType: BapMessageType.ActivityHostToClientNotification,
        sequence: 7,
        body,
        activityHostId: 1n,
      })
    );

    expect(inner.length).toBe(0x20 + body.length);
    expect(inner.readUInt16BE(0)).toBe(
      BapMessageType.ActivityHostToClientNotification
    );
    expect(inner.readUInt32BE(2)).toBe(7);
    expect(inner.readBigUInt64BE(6)).toBe(0n);
    expect(inner.readBigUInt64BE(0x18)).toBe(1n);
    expect(inner.subarray(0x20)).toEqual(body);
    expect(inner.subarray(6, 8).equals(Buffer.from("00c8", "hex"))).toBe(false);
  });

  it("does not put 0x00c8 on wire 9", () => {
    const body = Buffer.from("01", "hex");
    const codec = new BungieCodec();
    const inner = innerOf(
      codec.encode({
        msgType: BapMessageType.BapToClientActivityNotification,
        sequence: 3,
        body,
      })
    );

    expect(inner.readUInt16BE(0)).toBe(
      BapMessageType.BapToClientActivityNotification
    );
    expect(inner.readUInt32BE(2)).toBe(3);
    expect(inner.subarray(6)).toEqual(body);
  });

  it("keeps the status trailer on request/response types", () => {
    const body = Buffer.from("aa", "hex");
    const codec = new BungieCodec();
    const inner = innerOf(
      codec.encode({
        msgType: BapMessageType.ClientToActivityHostManagerResponse,
        sequence: 1,
        body,
      })
    );

    expect(inner.readUInt16BE(6)).toBe(0x00c8);
    expect(inner.subarray(8)).toEqual(body);
  });
});

it('rejects impossible frame headers before waiting for their advertised bodies', () => {
  const codec = new BungieCodec();
  for (const [flag, length] of [[2, 0xffffffff], [1, MAX_BAP_FRAME_BYTES + 1],
    [2, 5], [1, 21], [3, 1024]]) {
    const header = Buffer.alloc(6);
    header[0] = 1; header[1] = flag; header.writeUInt32BE(length, 2);
    expect(() => codec.tryDecode(header)).toThrow(/BAP frame (length|flag)/);
  }
});

it('preserves fragmented plaintext and authenticated frames and consumes one coalesced frame at a time', () => {
  for (const encrypted of [false, true]) {
    const sender = new BungieCodec(), receiver = new BungieCodec();
    if (encrypted) {
      sender.enableEncryption(Buffer.alloc(16, 7), Buffer.alloc(12, 3));
      const peerNonce = Buffer.alloc(12, 3);
      peerNonce[11] ^= 1; // Opposite send/receive direction.
      receiver.enableEncryption(Buffer.alloc(16, 7), peerNonce);
    }
    const message = {msgType: BapMessageType.BapToClientActivityNotification,
      sequence: 17, body: Buffer.from('010203040506', 'hex')};
    const first = sender.encode(message), second = sender.encode({...message, sequence: 18});
    for (const length of [1, 5, 6, first.length - 1]) {
      expect(receiver.tryDecode(first.subarray(0, length))).toEqual({consumed: 0});
    }
    const combined = Buffer.concat([first, second]);
    const decoded = receiver.tryDecode(combined);
    expect(decoded).toEqual({consumed: first.length, message});
    expect(receiver.tryDecode(combined.subarray(decoded.consumed))).toEqual({
      consumed: second.length, message: {...message, sequence: 18},
    });
  }
});
