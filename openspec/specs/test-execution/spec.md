## ADDED Requirements

### Requirement: Single test case execution
The system SHALL execute a single test case by sending the defined HTTP request through the backend proxy and recording the full response.

#### Scenario: Execute a test case
- **WHEN** user clicks "Execute" on a test case
- **THEN** the backend sends the HTTP request to the target API, captures the response (status, headers, body, duration in ms), and returns the result to the frontend

### Requirement: Batch test execution
The system SHALL execute multiple test cases in sequence and display aggregated results.

#### Scenario: Run all test cases for an endpoint
- **WHEN** user clicks "Run All" on an endpoint's test case list
- **THEN** all cases execute sequentially, a progress indicator shows completion, and a summary displays total/passed/failed counts

### Requirement: Pass/fail evaluation
The system SHALL evaluate test results against expected outcomes defined in the test case: expected HTTP status code and optional body content assertions.

#### Scenario: Test passes
- **WHEN** actual response status matches expected status and body assertions pass
- **THEN** the result is marked as "passed" with a green indicator

#### Scenario: Test fails
- **WHEN** actual response status differs from expected, or body assertions fail
- **THEN** the result is marked as "failed" with a red indicator and a `failReason` describing the mismatch

### Requirement: Result persistence
Each test execution result SHALL be saved as a JSON file under `data/test-results/{id}.json` containing: case reference, timestamp, full request sent, full response received, duration, pass/fail status, and failure reason.

#### Scenario: Save and retrieve results
- **WHEN** a test completes execution
- **THEN** the result is automatically saved and appears in the history view

### Requirement: Test history view
The system SHALL display a chronological history of test executions for a project, showing date, endpoint, pass/fail counts, and the ability to drill into individual results.

#### Scenario: View execution history
- **WHEN** user navigates to the results page for a project
- **THEN** a list of past execution runs is shown, sorted by most recent first, with pass rate summaries

#### Scenario: View result detail
- **WHEN** user clicks on a historical test result
- **THEN** the full request and response are displayed side-by-side in read-only Monaco Editors

### Requirement: Request proxying
All test HTTP requests SHALL be sent from the backend server (not the browser) to avoid CORS restrictions.

#### Scenario: CORS-free request execution
- **WHEN** a test case targets `https://external-api.com/users`
- **THEN** the Hono backend sends the request using undici and returns the response to the frontend, bypassing browser CORS policies
