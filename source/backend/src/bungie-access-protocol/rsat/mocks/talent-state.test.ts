import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeServerMessage, encodeServerMessage } from "@blamnetwork/rsat";
import { Unknown808019AE } from "../../queuez/families/self";
import { TalentActivateRequest } from "../schemas/talent-requests";
import {
  activateTalentStep, resetTalentStateForTests, TALENT_ITEM_SOID,
  talentValue, talentVersion, talentAbilityRecords,
} from "./talent-state";

let directory: string | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  resetTalentStateForTests();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("bounded native Warlock Nova Bomb talent transaction", () => {
  it("keeps authored starting grants, rejects foreign requests, then persists actual selection", () => {
    vi.stubEnv("D1A_TALENT_PROBE", "1");
    directory = mkdtempSync(join(tmpdir(), "d1a-talent-"));
    const path = join(directory, "talent.json");
    vi.stubEnv("D1A_TALENT_STATE_PATH", path);
    const before = talentValue();
    expect(before.unknown0).toBe(251);
    expect(talentAbilityRecords().map(r => r.unknown0)).toEqual([23, -1, 22, -1, 20]);
    expect(before.unknown1).toMatchObject({ unknown0: 12, unknown1: 49000 });
    expect(before.unknown4?.unknown0.filter((v) => v === 1)).toHaveLength(3);
    expect(before.unknown5?.unknown0[1]).toEqual({ unknown0: -1, unknown1: -1 });
    expect(activateTalentStep(123n, 21).accepted).toBe(false);
    expect(activateTalentStep(TALENT_ITEM_SOID, 3).accepted).toBe(false);
    expect(talentVersion()).toBe(0);
    const wire = encodeServerMessage(801, TalentActivateRequest, { itemSoid: TALENT_ITEM_SOID, nodeIndex: 21 });
    const request = decodeServerMessage(wire, TalentActivateRequest).value;
    expect(activateTalentStep(request.itemSoid, request.nodeIndex)).toMatchObject({ accepted: true, changed: true });
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ definition: 442, purchased: [21], version: 1 });
    resetTalentStateForTests();
    expect(talentVersion()).toBe(1);
    const restored = talentValue();
    expect(restored.unknown4?.unknown0[21]).toBe(1);
    expect(talentAbilityRecords().map(r => r.unknown0)).toEqual([23, 12, 22, -1, 20]);
    expect(talentAbilityRecords()[1]!.unknown1.unknown0).toEqual(Array(8).fill(0x811c9dc5));
    expect(restored.unknown5?.unknown0[1]).toEqual({ unknown0: 21, unknown1: 0 });
    expect(activateTalentStep(TALENT_ITEM_SOID, 21).changed).toBe(false);
    // Exercise the exact nested native fields, including -1 sentinels in unused slots.
    const stateWire = encodeServerMessage(801, Unknown808019AE, restored);
    expect(decodeServerMessage(stateWire, Unknown808019AE).value).toEqual(restored);
  });

  it("allows one authored movement and grenade choice without granting alternatives", () => {
    vi.stubEnv("D1A_TALENT_PROBE", "1");
    vi.stubEnv("D1A_TALENT_STATE_PATH", "");
    expect(activateTalentStep(TALENT_ITEM_SOID, 0).accepted).toBe(true);
    expect(activateTalentStep(TALENT_ITEM_SOID, 14).accepted).toBe(false);
    expect(activateTalentStep(TALENT_ITEM_SOID, 1).accepted).toBe(true);
    const state = talentValue();
    expect(state.unknown5?.unknown0[3]).toEqual({ unknown0: 0, unknown1: 0 });
    expect(state.unknown5?.unknown0[0]).toEqual({ unknown0: 1, unknown1: 0 });
    expect(talentAbilityRecords().map(r => r.unknown0)).toEqual([41, -1, 22, 7, 20]);
    expect(state.unknown4?.unknown0[14]).toBe(0);
    expect(state.unknown4?.unknown0[21]).toBe(0);
  });

  it("does not acknowledge or change state if durable publication fails", () => {
    vi.stubEnv("D1A_TALENT_PROBE", "1");
    directory = mkdtempSync(join(tmpdir(), "d1a-talent-"));
    vi.stubEnv("D1A_TALENT_STATE_PATH", join(directory, "absent", "talent.json"));
    expect(activateTalentStep(TALENT_ITEM_SOID, 21)).toMatchObject({ accepted: false, changed: false });
    expect(talentVersion()).toBe(0);
    expect(talentValue().unknown4?.unknown0[21]).toBe(0);
  });
});
