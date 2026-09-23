import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {afterEach, describe, expect, it, vi} from "vitest";
import {dismantleItem, dismantleVersion, isDismantled} from "./dismantle-state";

const captured = {soid: 0x000000030000010bn, defIndex: 814, bucket: 3, slot: 7};
const dirs: string[] = [];

function profile() {
  const dir = mkdtempSync(join(tmpdir(), "d1a-dismantle-"));
  dirs.push(dir);
  const file = join(dir, "equipment.json");
  vi.stubEnv("D1A_EQUIPMENT_PROFILE", file);
  return file;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

describe("durable dismantle state", () => {
  it('rejects a full journal without making the saved profile unreadable', () => {
    const file = `${profile()}.dismantle.json`;
    const tombstones = Array.from({length: 512}, (_, i) => ({
      soid: (0x300020000n + BigInt(i)).toString(16).padStart(16, '0'),
      defIndex: 814, actionIndex: 814, removedAt: '2026-09-21T00:00:00Z',
    }));
    const original = JSON.stringify({schema: 1, policy: 'captured-native-hold-x-v1', version: 512, tombstones});
    writeFileSync(file, original);
    expect(dismantleItem(captured.soid, captured, 814, true)).toMatchObject({accepted: false, changed: false, reason: 'dismantle-journal-full'});
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(dismantleVersion()).toBe(512);
    expect(dismantleItem(BigInt(`0x${tombstones[0].soid}`), undefined, 814, true))
      .toMatchObject({accepted: true, changed: false});
  });
  it("commits the captured hold-X action by instance and makes retry idempotent", () => {
    const file = profile();
    expect(dismantleItem(captured.soid, captured, 814, true)).toEqual({
      accepted: true, changed: true, reason: "captured-native-hold-x",
    });
    expect(isDismantled(captured.soid)).toBe(true);
    expect(dismantleVersion()).toBe(1);
    expect(dismantleItem(captured.soid, undefined, 814, true)).toEqual({
      accepted: true, changed: false, reason: "already-dismantled",
    });
    const saved = JSON.parse(readFileSync(`${file}.dismantle.json`, "utf8"));
    expect(saved).toMatchObject({schema: 1, policy: "captured-native-hold-x-v1", version: 1,
      tombstones: [{soid: "000000030000010b", defIndex: 814, actionIndex: 814}]});
  });

  it("rejects mismatched actions and equipped instances without writing", () => {
    const file = profile();
    expect(dismantleItem(captured.soid, captured, 813, true).accepted).toBe(false);
    expect(dismantleItem(captured.soid, captured, 814, true, captured.soid).reason)
      .toBe("equipped-item-protected");
    expect(dismantleVersion()).toBe(0);
    expect(() => readFileSync(`${file}.dismantle.json`, "utf8")).toThrow();
  });

  it("protects ability records and absent/original identities", () => {
    profile();
    expect(dismantleItem(0x300000200n,
      {soid: 0x300000200n, defIndex: 442, bucket: 7, slot: 1}, 442, true).reason)
      .toBe("item-type-protected");
    expect(dismantleItem(0x300000008n, undefined, 934, true).reason).toBe("item-not-owned");
  });
});
