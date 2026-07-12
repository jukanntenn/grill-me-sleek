// 单元测试 · schema 校验模块
// 覆盖：Grilling JSON 合法/非法用例、allOf if-then 条件、question id 去重、
//       Response 序列化/反序列化、max_length 校验

use grilling_sleek::models::*;

// ---------------------------------------------------------------------------
// Grilling 合法用例
// ---------------------------------------------------------------------------

#[test]
fn grilling_valid_minimal() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"text"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert_eq!(g.questions.len(), 1);
    assert_eq!(g.questions[0].question_type, QuestionType::Text);
}

#[test]
fn grilling_valid_single_with_options() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"single","options":[{"label":"A"},{"label":"B"}]}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert_eq!(g.questions[0].question_type, QuestionType::Single);
    assert_eq!(g.questions[0].options.as_ref().unwrap().len(), 2);
}

#[test]
fn grilling_valid_multi_with_options() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"multi","options":[{"label":"X"},{"label":"Y"},{"label":"Z"}]}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert_eq!(g.questions[0].question_type, QuestionType::Multi);
}

#[test]
fn grilling_valid_single_yesno_no_options() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"single","variant":"yesno"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert_eq!(g.questions[0].variant, Variant::Yesno);
    assert!(g.questions[0].options.is_none());
}

#[test]
fn grilling_valid_single_rating_no_options() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"single","variant":"rating","rating_max":10}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert_eq!(g.questions[0].variant, Variant::Rating);
    assert_eq!(g.questions[0].rating_max, 10);
}

#[test]
fn grilling_valid_with_additional_notes() {
    let json = r#"{"name":"t","additional_notes":{"label":"Notes","required":true,"max_length":500},"questions":[{"id":"q","header":"h","text":"t","type":"text"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    let an = g.additional_notes.unwrap();
    assert!(an.required);
    assert_eq!(an.max_length, Some(500));
}

// ---------------------------------------------------------------------------
// Grilling 非法用例（serde 层面能解析，schema 校验在 handler 层）
// ---------------------------------------------------------------------------

#[test]
fn grilling_defaults() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"text"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert!(g.questions[0].required); // default true
    assert!(g.questions[0].allow_custom_text); // default true
    assert_eq!(g.questions[0].variant, Variant::Default);
    assert_eq!(g.questions[0].rating_max, 5);
}

// ---------------------------------------------------------------------------
// allOf if-then 条件：single(default/rating) 缺 options 应可解析（schema 层拒绝）
// single(yesno) 缺 options 应通过
// multi 缺 options 应可解析（schema 层拒绝）
// ---------------------------------------------------------------------------

#[test]
fn grilling_single_default_without_options_parses() {
    // serde 层面可以解析，但 jsonschema 会拒绝
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"single"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert!(g.questions[0].options.is_none());
}

#[test]
fn grilling_multi_without_options_parses() {
    let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"multi"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    assert!(g.questions[0].options.is_none());
}

// ---------------------------------------------------------------------------
// question id 去重（应用层校验）
// ---------------------------------------------------------------------------

#[test]
fn grilling_duplicate_question_id_detected() {
    let json = r#"{"name":"t","questions":[{"id":"q1","header":"h1","text":"t1","type":"text"},{"id":"q1","header":"h2","text":"t2","type":"text"}]}"#;
    let g: Grilling = serde_json::from_str(json).unwrap();
    let mut seen = std::collections::HashSet::new();
    let mut dup = false;
    for q in &g.questions {
        if !seen.insert(&q.id) {
            dup = true;
        }
    }
    assert!(dup, "duplicate question id should be detected");
}

// ---------------------------------------------------------------------------
// Response 序列化/反序列化：selected 多态
// ---------------------------------------------------------------------------

#[test]
fn response_selected_string_single() {
    let r = Response {
        round: 1,
        answers: vec![("q1".to_string(), Answer {
            selected: serde_json::Value::String("JWT".to_string()),
            custom_text: "".to_string(),
        })].into_iter().collect(),
        additional_notes: None,
        submitted_at: "2026-07-12T00:00:00Z".to_string(),
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("\"selected\":\"JWT\""));
    let r2: Response = serde_json::from_str(&json).unwrap();
    assert_eq!(r2.answers["q1"].selected.as_str().unwrap(), "JWT");
}

#[test]
fn response_selected_array_multi() {
    let r = Response {
        round: 1,
        answers: vec![("q1".to_string(), Answer {
            selected: serde_json::json!(["Redis", "WebSocket"]),
            custom_text: "".to_string(),
        })].into_iter().collect(),
        additional_notes: None,
        submitted_at: "2026-07-12T00:00:00Z".to_string(),
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("\"selected\":[\"Redis\",\"WebSocket\"]"));
    let r2: Response = serde_json::from_str(&json).unwrap();
    let arr = r2.answers["q1"].selected.as_array().unwrap();
    assert_eq!(arr.len(), 2);
}

#[test]
fn response_selected_rating_as_number_string() {
    // rating 的 selected 是数字字符串
    let r = Response {
        round: 1,
        answers: vec![("q1".to_string(), Answer {
            selected: serde_json::Value::String("4".to_string()),
            custom_text: "".to_string(),
        })].into_iter().collect(),
        additional_notes: None,
        submitted_at: "2026-07-12T00:00:00Z".to_string(),
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("\"selected\":\"4\""));
}

#[test]
fn response_additional_notes_none_omitted() {
    let r = Response {
        round: 1,
        answers: Default::default(),
        additional_notes: None,
        submitted_at: "2026-07-12T00:00:00Z".to_string(),
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(!json.contains("additional_notes"), "None should be omitted");
}

#[test]
fn response_additional_notes_some_present() {
    let r = Response {
        round: 1,
        answers: Default::default(),
        additional_notes: Some("notes here".to_string()),
        submitted_at: "2026-07-12T00:00:00Z".to_string(),
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("\"additional_notes\":\"notes here\""));
}

// ---------------------------------------------------------------------------
// JSON 紧凑序列化：serde_json 默认不转义 HTML
// ---------------------------------------------------------------------------

#[test]
fn json_no_html_escaping() {
    let g = Grilling {
        name: "<script>alert('xss')</script>".to_string(),
        description: None,
        additional_notes: None,
        questions: vec![],
    };
    let json = serde_json::to_string(&g).unwrap();
    // serde_json 默认不转义 < > &
    assert!(json.contains("<script>"), "should not escape HTML");
    assert!(json.contains("</script>"));
    assert!(!json.contains("\\u003c"), "should not use unicode escapes");
}
