import { describe, expect, it } from "vitest";
import { FAKE_DW_CANDIDATE_SESSION_ID } from "./constants";
import { buildLoopbackSessionResult } from "./matchmaking";
import {
  readTypedBlob,
  readTypedU32,
  writeTypedBlob,
  writeTypedU32,
} from "./typed-buffer";

describe("buildLoopbackSessionResult", () => {
  it("adds the server session fields and preserves the game-specific tail", () => {
    const host = Buffer.from([0x7f, 0, 0, 1]);
    const tail = writeTypedBlob(Buffer.from([0xaa, 0xbb, 0xcc]));
    const advert = Buffer.concat([
      writeTypedBlob(host),
      writeTypedU32(0x1122_3344),
      writeTypedU32(6),
      tail,
    ]);

    const result = buildLoopbackSessionResult(advert);
    expect(result).not.toBeNull();

    const hostField = readTypedBlob(result!);
    expect(hostField?.value).toEqual(host);
    const sessionField = readTypedBlob(hostField!.next);
    expect(sessionField?.value.readBigUInt64LE()).toBe(
      FAKE_DW_CANDIDATE_SESSION_ID
    );
    const gameType = readTypedU32(sessionField!.next);
    expect(gameType?.value).toBe(0x1122_3344);
    const maxPlayers = readTypedU32(gameType!.next);
    expect(maxPlayers?.value).toBe(6);
    const numPlayers = readTypedU32(maxPlayers!.next);
    expect(numPlayers?.value).toBe(1);
    expect(numPlayers?.next).toEqual(tail);
  });
});
