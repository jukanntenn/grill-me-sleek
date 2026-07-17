import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  saveConfig,
  setConfigValue,
  getConfigValue,
  unsetConfigValue,
} from "../src/config";

describe("CLI Configuration", () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), "grilling-sleek-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    // Restore original HOME and clean up
    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should load empty config when no file exists", () => {
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("should save and load config", () => {
    const config = { server: "http://localhost:3000" };
    saveConfig(config);

    const loaded = loadConfig();
    expect(loaded).toEqual(config);
  });

  it("should set and get config values", () => {
    setConfigValue("server", "http://localhost:3000");

    const value = getConfigValue("server");
    expect(value).toBe("http://localhost:3000");
  });

  it("should unset config values", () => {
    setConfigValue("server", "http://localhost:3000");
    unsetConfigValue("server");

    const value = getConfigValue("server");
    expect(value).toBeUndefined();
  });

  it("should handle multiple config values", () => {
    setConfigValue("server", "http://localhost:3000");
    setConfigValue("timeout", "30");

    const config = loadConfig();
    expect(config.server).toBe("http://localhost:3000");
    expect(config.timeout).toBe("30");
  });

  it("should return undefined for non-existent keys", () => {
    const value = getConfigValue("nonexistent");
    expect(value).toBeUndefined();
  });
});
