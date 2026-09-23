import { afterEach, expect, it, vi } from "vitest";
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => true) }));
vi.mock("dotenv", () => ({ config: vi.fn() }));
import { config } from "dotenv";
import { loadWebTigerEnv } from "./env";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("keeps a community runtime independent of current and ancestor dotenv files", () => {
  vi.stubEnv("D1A_ISOLATED_RUNTIME", "1");
  loadWebTigerEnv();
  expect(config).not.toHaveBeenCalled();
});
it("retains normal dotenv loading outside isolated runtime mode", () => {
  vi.stubEnv("D1A_ISOLATED_RUNTIME", "0");
  loadWebTigerEnv();
  expect(config).toHaveBeenCalledTimes(3);
  expect(config).toHaveBeenCalledWith(expect.objectContaining({ override: false }));
});
