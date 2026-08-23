# Validation spec

English | [中文](validation.zh.md)

The server's input-validation system. Built on **garde** (0.23, outer DTOs) and **jsonschema** (0.47, provider config) instead of hand-rolling, layering the two by the nature of what is validated.

## Validation layering model

| Payload                                 | Approach                                       | Tool            | Reception                                | Failure status |
| --------------------------------------- | ---------------------------------------------- | --------------- | ---------------------------------------- | -------------- |
| **Grilling** (provider config)          | JSON Schema + hand-written id uniqueness       | jsonschema 0.47 | `Json<serde_json::Value>`                | **400**        |
| Fixed-shape DTOs like **SessionUpdate** | `ValidatedJson<T>` derive                      | garde 0.23      | `ValidatedJson<T>`                       | **400**        |
| **ResponseInput** shell                 | garde derive                                   | garde 0.23      | `Json<ResponseInput>`                    | **400**        |
| **ResponseInput** cross-references      | garde struct-level custom (context=`Grilling`) | garde 0.23      | handler-level `validate_with(&grilling)` | **400**        |

### The 400 vs 422 semantics

**422** is reserved for `Idempotency-Key` reuse with a different body (`IdempotencyMismatch`).

Every "input format / business validation failure" returns **400**. This convention drives:

- Grilling does not use `Json<Grilling>` (an axum serde deserialization failure would return 422); it receives raw values via `Json<Value>` and lets jsonschema validate authoritatively, returning 400.
- The `ValidatedJson<T>` extractor maps both serde failures and garde failures to 400 (not axum's default 422).
- ResponseInput cross-reference failures return 400 at the handler layer.

## jsonschema (provider config)

**Purpose**: Grilling payloads (POST /sessions, POST /rounds). Schema-as-data: a new provider needs no recompile.

**Key conventions**:

- **`default-features = false`**: the default features (`resolve-http`, `resolve-file`, `tls-aws-lc-rs`) exist for remote `$ref` resolution (pulling reqwest/rustls/tokio). Our schemas are self-contained (no remote references), so disabling defaults trims the dependency tree. draft 2020-12 support is **always enabled**, independent of features.
- **Schema compiled into the binary**: `include_str!("../schemas/grilling.json")` embeds it at compile time; no file IO at runtime.
- **Process-wide singleton**: `Validator: Send + Sync` (a compile-time assertion exists in source at `jsonschema/src/validator.rs:903-906`), reused globally via `OnceLock<Validator>` — compiled once at startup.
- **draft 2020-12**: full support for `allOf`, `oneOf`, `anyOf`, `if/then/else`, `$ref`. The Grilling schema uses `allOf` + `if/then` to express the conditional rules "single(default/rating) requires options, multi requires options, single(yesno) is exempt".
- **API**: `jsonschema::validator_for(&schema_value)` compiles; `validator.validate(&instance)` returns `Result<(), ValidationError>` (first error only); `validator.is_valid(&instance)` is a fast yes/no (allocates no error details — used on hot paths).
- **id uniqueness**: JSON Schema `uniqueItems` compares by deep equality and cannot catch "same id, different body". The hand-written `validate_unique_question_ids` deduplicates by the `id` field.

## garde (outer DTOs)

**Purpose**: input validation for fixed-shape DTOs, through the custom axum extractor `ValidatedJson<T>`.

**Key conventions**:

### The Validate trait is synchronous

garde 0.23's `Validate` trait (`garde/src/validate.rs:12-52`) is **fully synchronous**, no async. In an async handler, call `value.validate()` directly (no `.await`).

### The rule is `pattern`, not `regex`

garde's regex rule attribute is `#[garde(pattern("regex"))]`, **not** `#[garde(regex(...))]`. `regex` is the feature-flag name (`garde = { features = ["regex"] }`), not the rule name. Source: `garde_derive/src/syntax.rs:353`, rule module `garde/src/rules/pattern.rs`.

### `length` counts bytes by default

`#[garde(length(max=N))]` counts **UTF-8 bytes** for `String` (`garde/src/rules/length/simple.rs:35-52`, calling `num_bytes()`). Counting Unicode characters requires `#[garde(length(chars, max=N))]`. ResponseInput's max_length validation keeps byte semantics (matching the original `s.len() as i64`).

### struct-level `#[garde(custom(fn))]`

- **Signature**: `fn(&Self, &Ctx) -> Result<(), garde::Error>` — sees every field of the struct and can use an external context. Source: `garde_derive/src/emit.rs:24-32`.
- **Stackable**: a struct may carry several `#[garde(custom(...))]`, each returning one error.
- **Runs before field rules**: struct-level custom executes ahead of per-field rules.
- Used for ResponseInput cross-references (context = `Grilling`).

### Context borrowing semantics

- The default context is `()`.
- A custom context is declared `#[garde(context(Grilling))]` (no lifetime written; the macro adds `&`).
- Call `value.validate_with(&ctx)` passing a borrowed reference. No `Default` bound needed (`validate_with` is a separate method).
- The extractor cannot supply a DB context (`&Grilling` is fetched from the DB in the handler), so ResponseInput's cross-reference validation runs at the handler layer, not in the extractor.

### `#[garde(skip)]`

Fields without validation rules must be marked `#[garde(skip)]` or compilation fails with "field has no validation". All SessionUpdate fields and all ResponseInput fields are validated by struct-level custom, so every one is marked `skip`.

## The ValidatedJson<T> extractor

**Location**: `server/src/extractors.rs`

**Design**:

- Deserialize JSON → `T: DeserializeOwned + garde::Validate`.
- serde failure → 400 `BadRequest`.
- garde failure → 400 `BadRequest` (the `Report`'s `Display` as the message).
- Constrained to `T::Context: Default` (the extractor has no external context).

**Fits**: self-contained DTOs (e.g. `SessionUpdate`, where the real constraints come from the serde enum and garde is the uniform entry point).

**Does not fit**: DTOs needing a DB context (e.g. `ResponseInput` needs `&Grilling`) — those are received as `Json<T>`, and the handler calls `validate_with(&ctx)` after loading the context.

## Implementation references

- Crates: `garde` 0.23 (`features = ["derive"]`), `jsonschema` 0.47 (`default-features = false`)
- Source: `server/src/validation.rs`, `server/src/extractors.rs`
- Schemas: `server/schemas/grilling.json`
- Context repos: `.local/contexts/garde` (tag `v0.23.0`), `.local/contexts/Stranger6667/jsonschema` (tag `rust-v0.47.0`)
