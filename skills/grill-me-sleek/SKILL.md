---
name: grill-me-sleek
description: Batch interview the user about plans/designs with a sleek web interface. Generates all questions at once with recommended answers, opens an interactive HTML page for bulk review, and waits for user feedback. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Generate ALL questions in one batch — do not ask one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Workflow

1. **Analyze the user's input** thoroughly to identify all critical decisions, assumptions, and ambiguities.
2. **Generate a complete list of questions** as a single JSON object (schema below). Each question must include your recommended answer, 2–4 alternative options, and a brief explanation.
3. **Push questions** to the server (non-blocking):

   ```
   bash "skills/grill-me-sleek/run.sh" << 'EOF'
   <JSON_DATA>
   EOF
   ```

   - This returns immediately with a JSON line like: `{"type":"pushed","url":"http://localhost:PORT","round":N,"browser_opened":true}`
   - Use a heredoc with single-quoted delimiter to avoid shell escaping issues.
   - Alternatively, pass JSON as a CLI argument: `bash "skills/grill-me-sleek/run.sh" '<json>'`
   - On Windows, use: `bash "skills/grill-me-sleek/run.sh" "<JSON_DATA>"`

4. **Output guidance** to the user in Markdown. Every round MUST include the browser URL:

   > 🌐 **Round N** — Please answer the questions in your browser: 🔗 http://localhost:PORT
   >
   > I'll receive your answers automatically and continue with the next analysis.

   If `browser_opened` is false, additionally instruct the user to open the URL manually.

5. **Wait for the user's response** by running:

   ```
   bash "skills/grill-me-sleek/run.sh" --wait
   ```

   This blocks until the user submits answers in the browser, then outputs the response JSON to stdout.

6. **Process the user's answers**: acknowledge decisions, and if any answers reveal new issues, generate a new JSON batch and repeat from step 3. The browser tab stays open and reloads automatically — no need to open a new tab.

7. **Summarize** the final shared understanding once all branches are resolved.
8. **Signal completion** by running `bash "skills/grill-me-sleek/run.sh" --done`. This shows the user a completion page in the browser and shuts down the server after 5 seconds.

## JSON Schema — Input (you generate this)

```json
{
  "title": "Plan Review: [Brief Title]",
  "description": "Review and confirm the following decisions. Recommended answers are pre-selected.",
  "questions": [
    {
      "id": "q_[unique_id]",
      "text": "Clear, specific question",
      "recommended": "Your recommended answer",
      "options": ["Option 1", "Option 2", "Other (please specify)"],
      "explanation": "Why you recommend this option"
    }
  ]
}
```

## JSON Schema — Output (server returns this)

```json
{
  "answers": {
    "q_[unique_id]": {
      "selected": "The option the user chose",
      "custom_text": "Additional text if user selected 'Other'"
    }
  },
  "additional_notes": "Any global notes the user added",
  "submitted_at": "ISO timestamp"
}
```

## Error Handling

- If the script fails to run, fall back to asking questions one at a time in the terminal.
- If the JSON is invalid, regenerate it with proper escaping.
- If the user closes the browser without submitting, ask if they want to try again or switch to text mode.
- Never modify the server script — only use it as instructed.
