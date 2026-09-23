import { describe, expect, it, vi } from "vitest";
import { encodeServerMessage } from "@blamnetwork/rsat";
import {
  ACTIVITY_HOST_MANAGER_RESPONSE_TYPE,
  ACTIVITY_HOST_MANAGER_START_TYPE,
  ActivityHostManager,
  buildActivityHostManagerResponse,
  parseActivityHostManagerRequest,
} from "./activity-host-manager";
import { formatActivityHostTag } from "./config";
import { ActivityHostStartupOptionsRequest, START_REQUEST_PAYLOAD_SIZE, START_REQUEST_STREAM_SIZE_OFFSET } from "./start-request";

function silentLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function startBody(activityId = 0): Buffer {
  const inner = Buffer.alloc(START_REQUEST_PAYLOAD_SIZE, 0);
  const options = encodeServerMessage(1303, ActivityHostStartupOptionsRequest, {
    activityId,
    ipValid: false,
    unknown1: false,
  });
  inner.writeUInt16BE(options.length, 0);
  options.copy(inner, 2);
  inner.writeUInt16BE(0, START_REQUEST_STREAM_SIZE_OFFSET);
  const body = Buffer.alloc(3095, 0);
  body[0] = ACTIVITY_HOST_MANAGER_START_TYPE;
  inner.copy(body, 1);
  return body;
}

describe("ActivityHostManager", () => {
  it("selects a playlist map once per launch and keeps overlapping hosts independent", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const manager = new ActivityHostManager(silentLogger());
      manager.bindSession(); manager.bindSession();
      const request = {msgType:6, sequence:1, body:startBody(8)};
      expect(manager.handle(request, "FAH")).not.toBeNull();
      expect(manager.getResolvedRoute("FAH")).toMatchObject({
        activityId:5, originalActivityId:8, requestedActivityId:8, generation:1,
      });
      random.mockReturnValue(0.99);
      manager.handle(request, "FAH");
      expect(manager.getResolvedRoute("FAH")).toMatchObject({activityId:5, generation:1});
      manager.handle(request, "GAH");
      expect(manager.getResolvedRoute("GAH")).toMatchObject({activityId:7, generation:2});
      expect(manager.getResolvedRoute("FAH")?.activityId).toBe(5);
      manager.handle({...request, body:startBody(9)}, "FAH");
      expect(manager.getResolvedRoute("FAH")).toMatchObject({activityId:7, requestedActivityId:9, generation:3});
      expect(random).toHaveBeenCalledTimes(3);
    } finally {
      random.mockRestore();
    }
  });
  it("isolates host routes and an invalid public request cannot clear the private route", () => {
    const manager = new ActivityHostManager(silentLogger());
    manager.bindSession(); manager.bindSession();
    manager.handle({msgType:6, sequence:1, body:startBody(2)}, "FAH");
    const venus = manager.getResolvedRoute("FAH");
    manager.handle({msgType:6, sequence:2, body:startBody(0)}, "GAH");
    expect(manager.getResolvedRoute("GAH")?.activityId).toBe(0);
    expect(manager.getResolvedRoute("FAH")).toBe(venus);
    manager.handle({msgType:6, sequence:3, body:startBody(32767)}, "GAH");
    expect(manager.getResolvedRoute("GAH")).toBeUndefined();
    expect(manager.getResolvedRoute("FAH")).toBe(venus);
  });

  it("retires closed routes and resets entity grants for the next host connection", () => {
    const manager = new ActivityHostManager(silentLogger());
    manager.bindSession(); manager.bindSession();
    manager.handle({msgType:6, sequence:1, body:startBody(0)}, "GAH");
    const generation = manager.getResolvedRoute("GAH")!.generation;
    expect(manager.gah!.takeFirstEntityIndexGrant()).not.toBeNull();
    manager.unbindSession("GAH");
    expect(manager.getResolvedRoute("GAH")).toBeUndefined();
    expect(manager.bindSession()).toBe("GAH");
    expect(manager.gah!.takeFirstEntityIndexGrant()).not.toBeNull();
    manager.handle({msgType:6, sequence:2, body:startBody(0)}, "GAH");
    expect(manager.getResolvedRoute("GAH")!.generation).toBeGreaterThan(generation);
  });
  it("replies to a start request and keeps the payload", () => {
    const manager = new ActivityHostManager(silentLogger());
    const rsp = manager.handle(
      { msgType: 6, sequence: 1, body: startBody() },
      "FAH"
    );

    expect(rsp?.[0]).toBe(2);
    expect(rsp?.readBigUInt64BE(1)).toBe(manager.fah.id);
    expect(manager.fah.id).not.toBe(0n);
    expect(manager.getStartRequest()?.activityId).toBe(0);
  });

  it("reads the request subtype", () => {
    const body = Buffer.alloc(3095, 0);
    body[0] = ACTIVITY_HOST_MANAGER_START_TYPE;
    body.writeBigUInt64BE(0x11n, 1);
    const req = parseActivityHostManagerRequest(body);
    expect(req?.type).toBe(ACTIVITY_HOST_MANAGER_START_TYPE);
    expect(req?.payload.readBigUInt64BE(0)).toBe(0x11n);
  });

  it("puts a non-zero activity-host id and HI:LO session string", () => {
    const body = buildActivityHostManagerResponse(1n);
    expect(body.length).toBe(137);
    expect(body[0]).toBe(ACTIVITY_HOST_MANAGER_RESPONSE_TYPE);
    expect(body.readBigUInt64BE(1)).toBe(1n);
    expect(body.readUInt32BE(5)).not.toBe(0);
    expect(body.subarray(9, 26).toString("ascii")).toBe("00000000:00000001");
  });

  it("starts with a FAH and no GAH", () => {
    const manager = new ActivityHostManager(silentLogger());
    expect(manager.fah.id).not.toBe(0n);
    expect(manager.gah).toBeUndefined();
  });

  it("binds the first session as FAH and the next as a distinct GAH", () => {
    const manager = new ActivityHostManager(silentLogger());
    expect(manager.bindSession()).toBe("FAH");
    expect(manager.bindSession()).toBe("GAH");
    expect(manager.gah?.id).toBeDefined();
    expect(manager.gah?.id).not.toBe(manager.fah.id);
  });

  it("returns the GAH id on a GAH start so PUBLIC TARGET join is not delivered to FAH", () => {
    const manager = new ActivityHostManager(silentLogger());
    manager.bindSession();
    manager.bindSession();

    const rsp = manager.handle(
      { msgType: 6, sequence: 1, body: startBody() },
      "GAH"
    );

    expect(manager.gah).toBeDefined();
    expect(rsp?.readBigUInt64BE(1)).toBe(manager.gah?.id);
    expect(rsp?.subarray(9, 26).toString("ascii")).toBe(
      formatActivityHostTag(manager.gah!.id)
    );
  });

  it("rebinds FAH after the FAH session unbinds", () => {
    const manager = new ActivityHostManager(silentLogger());
    expect(manager.bindSession()).toBe("FAH");
    expect(manager.fah.takeFirstEntityIndexGrant()).not.toBeNull();
    expect(manager.fah.takeFirstEntityIndexGrant()).toBeNull();
    manager.unbindSession("FAH");
    expect(manager.bindSession()).toBe("FAH");
    expect(manager.fah.takeFirstEntityIndexGrant()).not.toBeNull();
  });

  it("absorbs an empty body", () => {
    const logger = silentLogger();
    const manager = new ActivityHostManager(logger);
    expect(
      manager.handle({ msgType: 6, sequence: 1, body: Buffer.alloc(0) }, "FAH")
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
    expect(manager.getStartRequest()).toBeUndefined();
  });

  it("rejects an unsupported activity instead of returning a wrong-world host", () => {
    const manager = new ActivityHostManager(silentLogger());
    expect(manager.handle({ msgType: 6, sequence: 1, body: startBody(32_767) }, "FAH")).toBeNull();
    expect(manager.getResolvedRoute()).toBeUndefined();
  });

  it("retains the original id and does not advance generation for a duplicate", () => {
    const manager = new ActivityHostManager(silentLogger());
    const body = startBody(2);
    expect(manager.handle({ msgType: 6, sequence: 1, body }, "FAH")).not.toBeNull();
    const first = manager.getResolvedRoute();
    expect(first).toMatchObject({ activityId: 2, originalActivityId: 2, generation: 1 });
    expect(first?.activityName).toBe("venus_chapter_2");
    expect(manager.handle({ msgType: 6, sequence: 2, body }, "FAH")).not.toBeNull();
    expect(manager.getResolvedRoute()?.generation).toBe(1);
  });
});
