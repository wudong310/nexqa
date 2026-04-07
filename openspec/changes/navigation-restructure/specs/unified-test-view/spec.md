## ADDED Requirements

### Requirement: Unified test view
The API test page at `/p/$projectId/api` SHALL display all test cases across all documents in a single view, with a left filter panel, a center case list grouped by endpoint, and a right detail panel.

#### Scenario: View all cases across documents
- **WHEN** user navigates to `/p/$projectId/api`
- **THEN** the system loads all API docs and test cases for the project and displays them grouped by `method + path`

### Requirement: Document filter
The left panel SHALL include checkboxes for each API document. Users MUST be able to filter the case list by selecting/deselecting documents.

#### Scenario: Filter by document
- **WHEN** user unchecks "用户 API" document
- **THEN** the case list hides all test cases belonging to that document

#### Scenario: Default all selected
- **WHEN** user first loads the page
- **THEN** all document checkboxes are selected

### Requirement: Tag filter
The left panel SHALL include tag filter buttons. Users MUST be able to filter cases by selecting tags.

#### Scenario: Filter by tag
- **WHEN** user clicks tag "反向"
- **THEN** only test cases with the "反向" tag are shown

### Requirement: Inline execution status
Each test case in the list MUST display its latest execution result inline: pass/fail indicator, HTTP status, and duration. Cases with no execution history MUST show "未执行".

#### Scenario: Case with latest result
- **WHEN** a test case has been executed
- **THEN** the list shows ✓/✗ indicator, response status code, and duration next to the case name

#### Scenario: Case never executed
- **WHEN** a test case has no execution history
- **THEN** the list shows a neutral "未执行" indicator

### Requirement: Batch operations on filtered scope
The "全部生成" and "全部执行" buttons SHALL operate on the currently filtered set of cases/endpoints.

#### Scenario: Generate for filtered documents
- **WHEN** user has only "订单 API" selected and clicks "全部生成"
- **THEN** test cases are generated only for endpoints in the "订单 API" document

### Requirement: Detail panel
When a test case is selected, the right panel SHALL show a Monaco JSON editor for the case definition, execute button, and the latest execution result.

#### Scenario: Select and edit case
- **WHEN** user clicks a test case in the list
- **THEN** the right panel shows the case JSON in Monaco editor with save and execute buttons
