import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Configuration file management
//
// Follows XDG Base Directory Specification:
// - Linux/macOS: ~/.config/grilling-sleek/config.json
// - Windows: %APPDATA%\grilling-sleek\config.json
//
// Configuration priority (highest to lowest):
// 1. Command line arguments
// 2. Environment variables
// 3. Config file
// 4. Default values
// ---------------------------------------------------------------------------

interface Config {
  server?: string;
  timeout?: number;
  longpoll_timeout?: number;
  [key: string]: string | number | undefined;
}

/**
 * Get the config file path based on the platform.
 */
export function getConfigPath(): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      "grilling-sleek",
      "config.json",
    );
  }
  return join(homedir(), ".config", "grilling-sleek", "config.json");
}

/**
 * Load config from file.
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save config to file.
 */
export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Get a config value by key.
 */
export function getConfigValue(key: string): string | number | undefined {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a config value.
 */
export function setConfigValue(key: string, value: string | number): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Unset a config value.
 */
export function unsetConfigValue(key: string): void {
  const config = loadConfig();
  delete config[key];
  saveConfig(config);
}

/**
 * Get the server URL with priority:
 * 1. Environment variable GRILLING_SLEEK_SERVER
 * 2. Config file
 * 3. Default value
 */
export function getServer(): string {
  return (
    process.env.GRILLING_SLEEK_SERVER ||
    (loadConfig().server as string) ||
    "https://grillingsleek.online"
  );
}

/**
 * Get the HTTP timeout with priority:
 * 1. Environment variable GRILLING_SLEEK_HTTP_TIMEOUT
 * 2. Config file
 * 3. Default value (10 seconds)
 */
export function getTimeout(): number {
  const envTimeout = process.env.GRILLING_SLEEK_HTTP_TIMEOUT;
  if (envTimeout) {
    return Number(envTimeout) * 1000;
  }
  const configTimeout = loadConfig().timeout;
  if (configTimeout) {
    return Number(configTimeout) * 1000;
  }
  return 10 * 1000;
}

/**
 * Get the long poll HTTP timeout with priority:
 * 1. Environment variable GRILLING_SLEEK_LONGPOLL_HTTP_TIMEOUT
 * 2. Config file
 * 3. Default value (65 seconds)
 */
export function getLongPollTimeout(): number {
  const envTimeout = process.env.GRILLING_SLEEK_LONGPOLL_HTTP_TIMEOUT;
  if (envTimeout) {
    return Number(envTimeout) * 1000;
  }
  const configTimeout = loadConfig().longpoll_timeout;
  if (configTimeout) {
    return Number(configTimeout) * 1000;
  }
  return 65 * 1000;
}
