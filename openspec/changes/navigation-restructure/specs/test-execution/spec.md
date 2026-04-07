## MODIFIED Requirements

### Requirement: Batch test execution
The system SHALL execute multiple test cases in sequence. In the unified test view, "全部执行" operates on the currently filtered set of cases.

#### Scenario: Run filtered cases
- **WHEN** user clicks "全部执行" with specific documents and tags selected
- **THEN** only the filtered cases execute sequentially with progress indicator

### Requirement: Test history view
The system SHALL display execution history on a dedicated page at `/p/$projectId/history`, grouped by execution batch with pass/fail summaries.

#### Scenario: View execution history
- **WHEN** user navigates to `/p/$projectId/history`
- **THEN** a list of past execution batches is shown, sorted by most recent first, with pass rate summaries

### Requirement: Inline result display
Each test case in the unified test view MUST display its latest execution result inline (pass/fail, status code, duration).

#### Scenario: Case with latest result
- **WHEN** a test case has been executed at least once
- **THEN** the unified list shows ✓/✗, response status, and duration inline
