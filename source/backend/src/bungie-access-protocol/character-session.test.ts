import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { decode, decodeServerMessage } from "@blamnetwork/rsat";
import { BungieAccessProtocolSession } from "./session";
import { BapMessageType } from "./constants";
import { SelfPrimary } from "./queuez";
import { CreateCharacterResponse, DeleteCharacterResponse, CustomizeCharacterResponse, LoginCharacterResponse, SignoutCharacterResponse, parseCharacterSessionRequest } from "./rsat/schemas/character-session";
import { InventoryEquipResponse } from "./rsat/schemas/messages";
import { currentEquipmentVersion } from "./rsat/mocks/loadout";
import { SIGNED_IN_CHARACTER_SOID } from "./rsat/constants";

// Descriptor-derived vectors, not captured gameplay packets.
const login = Buffer.from("01f8000000020000000200", "hex");
const signout = Buffer.from("01f900", "hex");

describe("native character login and sign-out", () => {
  it("rejects unsupported creation, deletion and customization with typed failure, preserving the saved character", () => {
    const socket = new EventEmitter();
    const session = new BungieAccessProtocolSession(socket as any, {
      log: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
    }) as any;
    const sent: any[] = [];
    session.send = (message: any) => sent.push(message);
    const version = currentEquipmentVersion();
    // 501 was captured from native creator Done in r576-native-creation-observe-20260922.
    const create = Buffer.from("01f5c06030102d90101010853085f07a5086b0865084dec32de86c038c0003fffbfffbfffbfffbfffbfffbfffbfff81d14000400040004000400040000", "hex");
    try {
      for (const body of [create, Buffer.from("01f6000000020000000200", "hex"), Buffer.from("01fa", "hex")]) {
        for (const selected of [SIGNED_IN_CHARACTER_SOID, 0n]) {
          session.selectedCharacterSoid = selected;
          sent.length = 0;
          session.handleWorldServerRequest({ msgType: BapMessageType.ClientToWorldServerRequest, sequence: 44, body });
          expect(sent).toHaveLength(1);
          expect(sent[0]).toMatchObject({ msgType: BapMessageType.ClientToWorldServerResponse, sequence: 44 });
          expect(sent[0].body.readUInt16BE(0)).toBe(body.readUInt16BE(0));
          const id = body.readUInt16BE(0);
          const result = id === 501 ? decodeServerMessage(sent[0].body, CreateCharacterResponse).value :
            id === 502 ? decodeServerMessage(sent[0].body, DeleteCharacterResponse).value :
              decodeServerMessage(sent[0].body, CustomizeCharacterResponse).value;
          expect(result.status.unknown0).toBe(-1);
          if (id === 501) expect((result as any).characterSoid).toBe(0n);
          expect(session.selectedCharacterSoid).toBe(selected);
          expect(session.characterRevision).toBe(0);
          expect(currentEquipmentVersion()).toBe(version);
        }
      }
    } finally { socket.emit("close"); }
  });

  it("rejects truncated, optional, and trailing data before changing character state", () => {
    expect(parseCharacterSessionRequest(login)).toBe(SIGNED_IN_CHARACTER_SOID);
    expect(parseCharacterSessionRequest(signout)).toBe(0n);
    for (const body of [login.subarray(0, 10), Buffer.concat([login, Buffer.from([0])]),
      Buffer.from("01f980", "hex"), Buffer.from("01f9", "hex")]) {
      expect(parseCharacterSessionRequest(body)).toBeNull();
    }
  });

  it("signs out, publishes a cleared baseline, rejects mutation, and logs back in without changing the save", () => {
    const socket = new EventEmitter();
    const session = new BungieAccessProtocolSession(socket as any, {
      log: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(),
    }) as any;
    const sent: any[] = [];
    session.send = (message: any) => sent.push(message);
    session.inventorySubscriptions.set(4, 0x100000001n);
    const version = currentEquipmentVersion();
    const request = (body: Buffer) => {
      sent.length = 0;
      session.handleWorldServerRequest({ msgType: BapMessageType.ClientToWorldServerRequest, sequence: 17, body });
      return sent.find((message) => message.msgType === BapMessageType.ClientToWorldServerResponse);
    };
    try {
      let response = request(signout);
      expect(response.sequence).toBe(17);
      expect(decodeServerMessage(response.body, SignoutCharacterResponse).value.status.unknown0).toBe(0);
      const cleared = sent.find((message) => message.msgType === BapMessageType.QueuezToClientUpdateNotification).body;
      expect(cleared[20]).toBe(1);
      expect(cleared.readUInt32BE(21)).toBe(1);
      const primary = decode(SelfPrimary, cleared.subarray(41, 41 + cleared.readUInt32BE(37)));
      expect(primary.unknown0.characterSoid).toBeUndefined();
      expect(session.selectedCharacterSoid).toBe(0n);

      response = request(Buffer.from("0193000000030000000700", "hex"));
      expect(decodeServerMessage(response.body, InventoryEquipResponse).value.status.unknown0).toBe(-1);
      expect(currentEquipmentVersion()).toBe(version);
      response = request(Buffer.from("01f8000000020000000300", "hex"));
      expect(decodeServerMessage(response.body, LoginCharacterResponse).value.status.unknown0).toBe(-1);
      expect(session.selectedCharacterSoid).toBe(0n);

      response = request(login);
      expect(decodeServerMessage(response.body, LoginCharacterResponse).value.status.unknown0).toBe(0);
      const restored = sent.find((message) => message.msgType === BapMessageType.QueuezToClientUpdateNotification).body;
      expect(restored.readUInt32BE(16)).toBeGreaterThan(cleared.readUInt32BE(16));
      expect(restored.readUInt32BE(21)).toBeGreaterThan(1);
      expect(session.selectedCharacterSoid).toBe(SIGNED_IN_CHARACTER_SOID);
      expect(currentEquipmentVersion()).toBe(version);
      request(login);
      expect(sent.filter((message) => message.msgType === BapMessageType.QueuezToClientUpdateNotification)).toHaveLength(0);
    } finally { socket.emit("close"); }
  });
});
