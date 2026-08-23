# Spec index

English | [中文](index.zh.md)

The authoritative index of spec documents; every spec has a row, every row is a file ([gate](../scripts/verify_specs_index.py)).

| Spec                                     | What it covers                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| [configuration.md](configuration.md)     | Server runtime configuration (config-rs layering, env vars, constants)        |
| [e2e.md](e2e.md)                         | End-to-end testing (real-stack Playwright over Docker Compose)                |
| [validation.md](validation.md)           | Server input validation (garde for DTOs, jsonschema for provider config)      |
| [rust-guidelines.md](rust-guidelines.md) | Pragmatic Rust guidelines — **vendored**, exempt from the documentation gates |
