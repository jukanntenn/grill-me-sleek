#[cfg(test)]
mod tests {
    use crate::models::*;
    use serde_json;

    // --- SessionStatus ---

    #[test]
    fn session_status_from_i64() {
        assert_eq!(SessionStatus::from_i64(0), Some(SessionStatus::Active));
        assert_eq!(SessionStatus::from_i64(1), Some(SessionStatus::Completed));
        assert_eq!(SessionStatus::from_i64(2), Some(SessionStatus::Cancelled));
        assert_eq!(SessionStatus::from_i64(3), Some(SessionStatus::Expired));
        assert_eq!(SessionStatus::from_i64(4), None);
        assert_eq!(SessionStatus::from_i64(-1), None);
    }

    #[test]
    fn session_status_try_from_i64() {
        // DESIGN.md §1262: derive(TryFrom<i64>) equivalent
        use std::convert::TryFrom;
        assert_eq!(SessionStatus::try_from(0), Ok(SessionStatus::Active));
        assert_eq!(SessionStatus::try_from(1), Ok(SessionStatus::Completed));
        assert_eq!(SessionStatus::try_from(2), Ok(SessionStatus::Cancelled));
        assert_eq!(SessionStatus::try_from(3), Ok(SessionStatus::Expired));
        assert!(SessionStatus::try_from(4).is_err());
        assert!(SessionStatus::try_from(-1).is_err());
    }

    #[test]
    fn session_status_as_str() {
        assert_eq!(SessionStatus::Active.as_str(), "active");
        assert_eq!(SessionStatus::Completed.as_str(), "completed");
        assert_eq!(SessionStatus::Cancelled.as_str(), "cancelled");
        assert_eq!(SessionStatus::Expired.as_str(), "expired");
    }

    #[test]
    fn session_status_repr_i64() {
        // DB stores status as int; verify the discriminant values.
        assert_eq!(SessionStatus::Active as i64, 0);
        assert_eq!(SessionStatus::Completed as i64, 1);
        assert_eq!(SessionStatus::Cancelled as i64, 2);
        assert_eq!(SessionStatus::Expired as i64, 3);
    }

    // --- Grilling serialization ---

    #[test]
    fn grilling_roundtrip() {
        let g = Grilling {
            name: "test".to_string(),
            description: Some("desc".to_string()),
            additional_notes: None,
            questions: vec![Question {
                id: "q1".to_string(),
                header: "Q1".to_string(),
                text: "Test question?".to_string(),
                question_type: QuestionType::Single,
                options: Some(vec![
                    OptionItem { label: "A".to_string(), description: None },
                    OptionItem { label: "B".to_string(), description: None },
                ]),
                recommended: Some(0),
                variant: Variant::Default,
                rating_max: 5,
                placeholder: None,
                max_length: None,
                required: true,
                allow_custom_text: true,
                explanation: Some("because".to_string()),
            }],
        };

        let json = serde_json::to_string(&g).unwrap();
        let parsed: Grilling = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "test");
        assert_eq!(parsed.questions.len(), 1);
        assert_eq!(parsed.questions[0].id, "q1");
        assert_eq!(parsed.questions[0].variant, Variant::Default);
    }

    #[test]
    fn grilling_yesno_no_options() {
        let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"single","variant":"yesno"}]}"#;
        let g: Grilling = serde_json::from_str(json).unwrap();
        assert_eq!(g.questions[0].variant, Variant::Yesno);
        assert!(g.questions[0].options.is_none());
    }

    #[test]
    fn grilling_rating_defaults() {
        let json = r#"{"name":"t","questions":[{"id":"q","header":"h","text":"t","type":"single","variant":"rating"}]}"#;
        let g: Grilling = serde_json::from_str(json).unwrap();
        assert_eq!(g.questions[0].variant, Variant::Rating);
        assert_eq!(g.questions[0].rating_max, 5);
        assert!(g.questions[0].required); // default true
        assert!(g.questions[0].allow_custom_text); // default true
    }

    // --- Response serialization ---

    #[test]
    fn response_single_selected() {
        let r = Response {
            round: 1,
            answers: vec![(
                "q1".to_string(),
                Answer {
                    selected: serde_json::Value::String("A".to_string()),
                    custom_text: "".to_string(),
                },
            )]
            .into_iter()
            .collect(),
            additional_notes: None,
            submitted_at: "2026-07-12T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"selected\":\"A\""));
    }

    #[test]
    fn response_multi_selected() {
        let r = Response {
            round: 1,
            answers: vec![(
                "q1".to_string(),
                Answer {
                    selected: serde_json::json!(["A", "B"]),
                    custom_text: "".to_string(),
                },
            )]
            .into_iter()
            .collect(),
            additional_notes: Some("notes".to_string()),
            submitted_at: "2026-07-12T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"selected\":[\"A\",\"B\"]"));
        assert!(json.contains("\"additional_notes\":\"notes\""));
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
        assert!(!json.contains("additional_notes"));
    }

    // --- SessionUpdate ---

    #[test]
    fn session_update_completed() {
        let json = r#"{"status":"completed"}"#;
        let u: SessionUpdate = serde_json::from_str(json).unwrap();
        assert_eq!(u.status, SessionUpdateStatus::Completed);
        assert!(u.reason.is_none());
        assert!(u.actor.is_none());
    }

    #[test]
    fn session_update_cancelled_with_reason() {
        let json = r#"{"status":"cancelled","reason":"user_cancelled","actor":"user"}"#;
        let u: SessionUpdate = serde_json::from_str(json).unwrap();
        assert_eq!(u.status, SessionUpdateStatus::Cancelled);
        assert_eq!(u.reason, Some(CancelReason::UserCancelled));
        assert_eq!(u.actor, Some(Actor::User));
    }

    // --- Variant enum ---

    #[test]
    fn variant_default_is_default() {
        assert_eq!(Variant::default(), Variant::Default);
    }
}
