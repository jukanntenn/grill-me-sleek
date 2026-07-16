import ky, { type KyInstance } from "ky";
import logger from "./logger";

// Configuration from environment variables
const SERVER = process.env.GRILLING_SLEEK_SERVER ?? "https://grillingsleek.online";
const HTTP_TIMEOUT = Number(process.env.GRILLING_SLEEK_HTTP_TIMEOUT ?? 10) * 1000;
const LONGPOLL_HTTP_TIMEOUT = Number(process.env.GRILLING_SLEEK_LONGPOLL_HTTP_TIMEOUT ?? 65) * 1000;

/**
 * Create an API client.
 *
 * @param method - HTTP method
 * @param isLongPoll - Whether this is a long-poll request (uses longer timeout)
 * @param idempotencyKey - Idempotency-Key header value (for POST requests)
 */
export function apiClient(
  method: "get" | "post" | "patch",
  isLongPoll = false,
  idempotencyKey?: string,
): KyInstance {
  let startTime = 0;

  return ky.create({
    prefixUrl: `${SERVER}/v1/`,
    method,
    timeout: isLongPoll ? LONGPOLL_HTTP_TIMEOUT : HTTP_TIMEOUT,
    headers: { Accept: "application/json" },
    retry: {
      limit: 3,
      // ky honours the Retry-After header for status codes in `afterStatusCodes`
      // (429 by default). `maxRetryAfter` caps the wait so a hostile Retry-After
      // can't stall the CLI indefinitely (DESIGN.md §2201-2207).
      maxRetryAfter: 30_000,
      methods: ["get", "post", "patch", "delete"],
      statusCodes: [408, 413, 429, 500, 502, 503, 504],
    },
    hooks: {
      beforeRequest: [
        (req) => {
          startTime = Date.now();
          if (idempotencyKey) {
            req.headers.set("Idempotency-Key", idempotencyKey);
          }
        },
      ],
      afterResponse: [
        (_req, _opts, res) => {
          const duration = Date.now() - startTime;
          logger.info({
            event: "http_request",
            method: _req.method,
            url: _req.url,
            status: res.status,
            duration_ms: duration,
          });
        },
      ],
    },
  });
}

/**
 * Read input from stdin or file.
 */
export async function readInput(fileFlag: string | undefined): Promise<string> {
  if (!fileFlag || fileFlag === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
  }
  const fs = await import("node:fs/promises");
  return await fs.readFile(fileFlag, "utf-8");
}