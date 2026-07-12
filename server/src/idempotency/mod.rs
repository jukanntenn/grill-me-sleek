//! Idempotency cache (moka `try_get_with` + TTL + concurrent dedup).
//!
//! DESIGN.md §1450-1498 — same Idempotency-Key replays return the first
//! creation's result (same session_id / round seq). Concurrent calls on the
//! same not-yet-existing key are coalesced into a single `init` evaluation
//! via moka's `try_get_with` (verified at `moka/src/future/cache.rs:1305`).
//! A key reused with a different request body returns 422 IdempotencyMismatch.

use moka::future::Cache;
use std::sync::Arc;
use std::time::Duration;

use crate::error::ApiError;

/// Idempotency cache entry: stores the first response for a given key.
#[derive(Clone)]
pub struct IdempotencyEntry {
    /// Serialized response body (JSON string).
    pub response_body: String,
    /// HTTP status code of the first response.
    pub status_code: u16,
    /// xxh3_64 hash of the request body, for detecting key+body mismatch.
    pub body_hash: u64,
}

/// Idempotency cache using moka with TTL and concurrent deduplication.
pub type IdempotencyCache = Arc<Cache<String, IdempotencyEntry>>;

/// Create a new idempotency cache.
pub fn new_cache(ttl: Duration, max_capacity: u64) -> IdempotencyCache {
    Arc::new(
        Cache::builder()
            .time_to_live(ttl)
            .max_capacity(max_capacity)
            .build(),
    )
}

/// Run a creation under idempotency semantics.
///
/// - If `idempotency_key` is None: run the creation once, no caching.
/// - If the key exists and `body_hash` matches: replay the cached response.
/// - If the key exists but `body_hash` differs: 422 IdempotencyMismatch.
/// - If the key does not exist: run the creation, cache its result. Concurrent
///   calls on the same key are coalesced into a single creation via moka's
///   `try_get_with` (DESIGN.md §1481 — only one of the calls evaluates).
///
/// `create` receives the entry it should cache (response body + status + the
/// same body_hash) so the runner stores exactly what the caller produced.
pub async fn run_idempotent<F, Fut>(
    cache: &IdempotencyCache,
    idempotency_key: Option<String>,
    body_hash: u64,
    create: F,
) -> Result<IdempotencyEntry, ApiError>
where
    F: FnOnce() -> Fut + Clone + Send + 'static,
    Fut: std::future::Future<Output = Result<IdempotencyEntry, ApiError>> + Send,
{
    let Some(key) = idempotency_key else {
        // No key — run once, do not cache.
        return create().await;
    };

    // Fast path: a prior completed result is cached.
    if let Some(entry) = cache.get(&key).await {
        if entry.body_hash == body_hash {
            return Ok(entry); // replay
        } else {
            return Err(ApiError::IdempotencyMismatch);
        }
    }

    // Slow path: try_get_with coalesces concurrent calls on the same key into
    // one `create` evaluation. The init future must return Result<V, E> with
    // E: Send + Sync + 'static; we use ApiError.
    let body_hash_for_init = body_hash;
    let create_for_init = create.clone();
    match cache
        .try_get_with(key.clone(), async move {
            create_for_init().await.inspect(|entry| {
                // Sanity: the entry's body_hash must match the request's.
                debug_assert_eq!(entry.body_hash, body_hash_for_init);
            })
        })
        .await
    {
        Ok(entry) => {
            // try_get_with may have cached an entry from a *different* body if a
            // prior request under the same key raced with a different body and
            // finished first. Re-verify body_hash on the returned entry.
            if entry.body_hash == body_hash {
                Ok(entry)
            } else {
                Err(ApiError::IdempotencyMismatch)
            }
        }
        Err(arc_err) => {
            // init returned Err(ApiError) — moka does not cache it.
            Err((*arc_err).clone())
        }
    }
}

/// Compute xxh3_64 hash of a byte slice.
pub fn hash_body(body: &[u8]) -> u64 {
    xxhash_rust::xxh3::xxh3_64(body)
}
