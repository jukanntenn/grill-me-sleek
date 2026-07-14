# 校验规范（Validation）

服务端输入校验体系。引入 **garde**（0.23，外层 DTO）和 **jsonschema**（0.47，provider config），避免重复造轮子，分层处理不同性质的校验。

## 校验分层模型

| 载荷 | 方案 | 工具 | 接收方式 | 失败状态码 |
|---|---|---|---|---|
| **Grilling**（provider config） | JSON Schema + 手写 id 去重 | jsonschema 0.47 | `Json<serde_json::Value>` | **400** |
| **SessionUpdate** 等固定结构 DTO | `ValidatedJson<T>` derive | garde 0.23 | `ValidatedJson<T>` | **400** |
| **ResponseInput** 外壳 | garde derive | garde 0.23 | `Json<ResponseInput>` | **400** |
| **ResponseInput** 交叉引用 | garde struct-level custom（context=`Grilling`） | garde 0.23 | handler 层 `validate_with(&grilling)` | **400** |

### 400 vs 422 语义

**422** 保留给 `Idempotency-Key` 复用但 body 不同（`IdempotencyMismatch`）。

所有"输入格式/业务校验失败"一律返回 **400**。这一约定决定了：

- Grilling 不用 `Json<Grilling>`（axum serde 反序列化失败会返 422），而用 `Json<Value>` 接收原始值，再由 jsonschema 权威校验返回 400。
- `ValidatedJson<T>` extractor 将 serde 失败和 garde 失败都映射为 400（而非 axum 默认的 422）。
- ResponseInput 交叉引用失败在 handler 层返回 400。

## jsonschema（provider config）

**用途**：Grilling payload（POST /sessions、POST /rounds）。schema-as-data，新 provider 无需重编译。

**关键约定**：

- **`default-features = false`**：默认特性（`resolve-http`、`resolve-file`、`tls-aws-lc-rs`）用于远程 `$ref` 解析（拉入 reqwest/rustls/tokio）。我们的 schema 自包含（无远程引用），关闭默认特性可精简依赖树。draft 2020-12 支持**始终启用**，不受 feature 影响。
- **schema 编译进二进制**：`include_str!("../schemas/grilling.json")` 编译期嵌入，运行时无文件 IO。
- **进程级单例**：`Validator: Send + Sync`（源码 `jsonschema/src/validator.rs:903-906` 有编译期断言），通过 `OnceLock<Validator>` 全局复用，启动编译一次。
- **draft 2020-12**：完整支持 `allOf`、`oneOf`、`anyOf`、`if/then/else`、`$ref`。Grilling schema 用 `allOf` + `if/then` 表达"single(default/rating) 需 options、multi 需 options、single(yesno) 豁免"的条件规则。
- **API**：`jsonschema::validator_for(&schema_value)` 编译；`validator.validate(&instance)` 返回 `Result<(), ValidationError>`（仅首个错误）；`validator.is_valid(&instance)` 快速 yes/no（不分配错误详情，热路径用）。
- **id 唯一性**：JSON Schema 的 `uniqueItems` 比深相等，抓不到"同 id 不同 body"。手写 `validate_unique_question_ids` 按 `id` 字段去重。

## garde（外层 DTO）

**用途**：固定结构 DTO 的输入校验。自建 axum extractor `ValidatedJson<T>`。

**关键约定**：

### Validate trait 是同步的
garde 0.23 的 `Validate` trait（`garde/src/validate.rs:12-52`）**完全同步**，无 async。在 async handler 里直接 `value.validate()` 即可（无需 `.await`）。

### 规则名 `pattern`（非 `regex`）
garde 的正则规则属性是 `#[garde(pattern("regex"))]`，**不是** `#[garde(regex(...))]`。`regex` 是 feature flag 名（`garde = { features = ["regex"] }`），不是规则名。源码：`garde_derive/src/syntax.rs:353`、规则模块 `garde/src/rules/pattern.rs`。

### `length` 默认按字节计数
`#[garde(length(max=N))]` 对 `String` 按 **UTF-8 字节**计数（`garde/src/rules/length/simple.rs:35-52`，调 `num_bytes()`）。要按 Unicode 字符计数须写 `#[garde(length(chars, max=N))]`。当前 ResponseInput 的 max_length 校验沿用字节语义（与原 `s.len() as i64` 一致）。

### struct-level `#[garde(custom(fn))]`
- **签名**：`fn(&Self, &Ctx) -> Result<(), garde::Error>`。可访问结构体的所有字段并使用外部 context。源码：`garde_derive/src/emit.rs:24-32`。
- **可叠加**：一个 struct 可堆叠多个 `#[garde(custom(...))]`，每个返回一个错误。
- **在字段规则前执行**：struct-level custom 先于 per-field 规则运行。
- 用于 ResponseInput 交叉引用（context = `Grilling`）。

### context 借用语义
- 默认 context 是 `()`。
- 自定义 context 声明 `#[garde(context(Grilling))]`（不写生命周期，宏自动加 `&`）。
- 调用 `value.validate_with(&ctx)` 传入借用引用。无需 `Default` bound（`validate_with` 是独立方法）。
- extractor 无法提供 DB context（`&Grilling` 在 handler 从 DB 取出），故 ResponseInput 的交叉引用校验在 handler 层调用，不在 extractor 层。

### `#[garde(skip)]`
无校验规则的字段必须标注 `#[garde(skip)]`，否则编译报错"field has no validation"。SessionUpdate 的所有字段、ResponseInput 的字段均用 struct-level custom 校验，故都标 `skip`。

## `ValidatedJson<T>` extractor

**位置**：`server/src/extractors.rs`

**设计**：
- 反序列化 JSON → `T: DeserializeOwned + garde::Validate`。
- serde 失败 → 400 `BadRequest`。
- garde 失败 → 400 `BadRequest`（`Report` 的 `Display` 作为 message）。
- 约束 `T::Context: Default`（extractor 无外部 context）。

**适用场景**：self-contained 的 DTO（如 `SessionUpdate`，实际约束靠 serde enum，garde 统一入口）。

**不适用场景**：需 DB context 的 DTO（如 `ResponseInput` 需 `&Grilling`）——这类 DTO 用 `Json<T>` 接收，handler 取出 context 后调 `validate_with(&ctx)`。

## 实现参考

- crates：`garde` 0.23（`features = ["derive"]`）、`jsonschema` 0.47（`default-features = false`）
- 源码：`server/src/validation.rs`、`server/src/extractors.rs`
- schemas：`server/schemas/grilling.json`
- 上下文仓库：`.local/contexts/garde`（tag `v0.23.0`）、`.local/contexts/Stranger6667/jsonschema`（tag `rust-v0.47.0`）
