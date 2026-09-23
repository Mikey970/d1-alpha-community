import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeServerMessage, encodeServerMessage } from "@blamnetwork/rsat";
import { VendorEconomy } from "./vendor-economy";
import { VendorBuyRequest, VendorBuyResponse } from "./vendor-request-capture";

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("vendor economy", () => {
  it("uses the recovered network901 request and response schemas", () => {
    const request = encodeServerMessage(901, VendorBuyRequest, { vendorIndex: 23, purchaseIndex: 4 });
    expect(decodeServerMessage(request, VendorBuyRequest).value).toEqual({ vendorIndex: 23, purchaseIndex: 4 });
    const response = encodeServerMessage(901, VendorBuyResponse, { status: { unknown0: 0, unknown1: 0 } });
    expect(decodeServerMessage(response, VendorBuyResponse).value.status.unknown0).toBe(0);
  });

  it("commits a package-backed Cryptarch purchase and its deduction", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1a-vendor-"));
    temporary.push(dir);
    const file = join(dir, "economy.json");
    const economy = new VendorEconomy(file, true);
    const before = economy.inventoryItems().find((item) => item.defIndex === 456)?.quantity;
    const result = economy.purchase(23, 0, { 1: 0 });
    expect(result).toMatchObject({ accepted: true, changed: true, rewardDefinition: 729 });
    expect(economy.inventoryItems().find((item) => item.defIndex === 456)?.quantity).toBe(before! - 200);
    expect(economy.inventoryItems()).toContainEqual(expect.objectContaining({ defIndex: 729, bucket: 1 }));
    expect(JSON.parse(readFileSync(file, "utf8")).purchases).toHaveLength(1);
  });

  it("seeds every recovered vendor cost and publishes exact equipment data", () => {
    const economy = new VendorEconomy(undefined, true);
    for (const definition of [456, 461, 462, 470, 471, 922, 923, 924, 925, 926]) {
      expect(economy.inventoryItems()).toContainEqual(expect.objectContaining({ defIndex: definition }));
    }
    expect(economy.purchase(22, 8, { 4: 0 })).toMatchObject({
      accepted: true,
      rewardDefinition: 982,
    });
    expect(economy.inventoryItems()).toContainEqual(expect.objectContaining({
      defIndex: 982,
      bucket: 4,
      slot: 8,
      artArrangement: 706,
      sandboxPattern: 13,
      equipReady: true,
    }));
    expect(economy.purchase(24, 0, { 1: 0 })).toMatchObject({
      accepted: true,
      rewardDefinition: 715,
    });
  });

  it("adds newly supported allowances without topping up spent balances", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1a-vendor-"));
    temporary.push(dir);
    const file = join(dir, "economy.json");
    writeFileSync(file, JSON.stringify({
      schema: 1,
      version: 4,
      nextSerial: 1,
      balances: { 456: 249_800, 461: 100_000, 462: 100_000, 470: 1_000, 471: 1_000 },
      purchases: [],
    }));
    const economy = new VendorEconomy(file, true);
    expect(economy.version).toBe(5);
    expect(economy.inventoryItems().find((item) => item.defIndex === 456)?.quantity).toBe(249_800);
    for (const definition of [922, 923, 924, 925, 926]) {
      expect(economy.inventoryItems()).toContainEqual(expect.objectContaining({ defIndex: definition }));
    }
  });

  it("does not deduct when the authored destination bucket is full", () => {
    const economy = new VendorEconomy(undefined, true);
    const before = economy.inventoryItems().find((item) => item.defIndex === 456)?.quantity;
    expect(economy.purchase(23, 0, { 1: 20 })).toMatchObject({
      accepted: false,
      changed: false,
      reason: "bucket-full",
    });
    expect(economy.inventoryItems().find((item) => item.defIndex === 456)?.quantity).toBe(before);
  });
});
