## ADDED Requirements

### Requirement: Execution history page
The system SHALL provide an execution history page at `/p/$projectId/history` showing all test execution results for the project, grouped by execution batch.

#### Scenario: View execution batches
- **WHEN** user navigates to `/p/$projectId/history`
- **THEN** a list of execution batches is shown sorted by most recent first, each displaying: timestamp, total/passed/failed counts, and pass rate

### Requirement: Batch detail drill-down
Users SHALL be able to expand a batch to see individual test results with case name, endpoint, status, and duration.

#### Scenario: Expand batch
- **WHEN** user clicks on an execution batch
- **THEN** the batch expands to show all individual results with pass/fail status, endpoint, and duration

### Requirement: Result detail view
Users SHALL be able to click an individual result to view the full request and response.

#### Scenario: View result detail
- **WHEN** user clicks on an individual test result within a batch
- **THEN** the full request and response are displayed in read-only Monaco editors
