import pino from "pino";
import { createStream } from "rotating-file-stream";
import pretty from "pino-pretty";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Log path resolution (XDG_STATE_HOME)
// ---------------------------------------------------------------------------

function getLogDir(): string {
  if (process.env.GRILLING_SLEEK_LOG_FILE) {
    return process.env.GRILLING_SLEEK_LOG_FILE;
  }
  const xdgStateHome =
    process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(xdgStateHome, "grilling-sleek", "logs");
}

// ---------------------------------------------------------------------------
// Log level resolution
// ---------------------------------------------------------------------------

function getLogLevel(): pino.Level {
  if (process.env.GRILLING_SLEEK_LOG_VERBOSE === "true") {
    return "debug";
  }
  const level = process.env.GRILLING_SLEEK_LOG_LEVEL;
  if (level && ["fatal", "error", "warn", "info", "debug", "trace"].includes(level)) {
    return level as pino.Level;
  }
  return "info";
}

// ---------------------------------------------------------------------------
// Create logger
// ---------------------------------------------------------------------------

const logDir = getLogDir();
const logLevel = getLogLevel();

// Ensure log directory exists before creating the stream (avoids async mkdir
// contention during process.exit → flushSync).
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

// Rotating file stream: 10MB per file, 30 files max, gzip compression
const fileStream = createStream("grilling-sleek.log", {
  path: logDir,
  size: "10M",
  maxFiles: 30,
  compress: "gzip",
  interval: "1d",
});

// Use pino-pretty as a direct transform stream (NOT via pino.transport) to
// avoid the worker-thread flushSync timeout on process.exit.
const prettyStream = pretty({
  colorize: true,
  translateTime: "SYS:HH:MM:ss.l",
  ignore: "pid,hostname",
  destination: 2,
});

const logger = pino(
  {
    level: logLevel,
    name: "grilling-sleek",
  },
  pino.multistream([
    // Development: pretty-print to stderr (direct stream, no worker thread)
    { level: "info", stream: prettyStream },
    // Production: NDJSON to rotating file
    { level: "debug", stream: fileStream },
  ]),
);

export default logger;

// ---------------------------------------------------------------------------
// Logging helpers for CLI commands
// ---------------------------------------------------------------------------

/**
 * Log CLI startup.
 */
export function logStartup(command: string, args: string[]): void {
  logger.info({
    event: "cli_startup",
    command,
    args,
    version: "0.2.0-rc.1",
  });
}

/**
 * Log CLI exit.
 */
export function logExit(exitCode: number): void {
  logger.info({
    event: "cli_exit",
    exit_code: exitCode,
  });
}

/**
 * Log an HTTP request.
 */
export function logRequest(
  method: string,
  url: string,
  status: number,
  durationMs: number,
  sessionId?: string,
  round?: number,
): void {
  logger.info({
    event: "http_request",
    method,
    url,
    status,
    duration_ms: durationMs,
    session_id: sessionId,
    round,
  });
}

/**
 * Log debug content (grilling JSON, request body, etc.).
 */
export function logDebug(label: string, data: unknown): void {
  logger.debug({ event: label, data });
}

/**
 * Log poll status.
 */
export function logPoll(event: string, sessionId: string, round: number, extra?: Record<string, unknown>): void {
  logger.debug({
    event: `poll_${event}`,
    session_id: sessionId,
    round,
    ...extra,
  });
}

/**
 * Log retry/backoff.
 */
export function logRetry(retryCount: number, backoffMs: number, errorMsg: string): void {
  logger.debug({
    event: "retry_backoff",
    retry_count: retryCount,
    backoff_ms: backoffMs,
    error_msg: errorMsg,
  });
}

/**
 * Log error with context.
 */
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({
    event: "error",
    message,
    error_message: err.message,
    error_stack: err.stack,
    ...context,
  });
}
