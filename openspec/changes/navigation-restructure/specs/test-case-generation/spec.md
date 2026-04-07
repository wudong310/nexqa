## MODIFIED Requirements

### Requirement: AI test case generation
The system SHALL generate HTTP test cases from confirmed API endpoint definitions by sending the structured endpoint data to the configured LLM. Generated cases SHALL cover: normal success paths, missing required parameters, invalid parameter formats, and boundary values. Generation is triggered from the unified API test view's left panel.

#### Scenario: Generate test cases for an endpoint
- **WHEN** user clicks "全部生成" in the unified test view
- **THEN** the LLM generates test cases for all endpoints in the currently filtered document set and adds them to the unified list

#### Scenario: Generate cases for filtered documents
- **WHEN** user has specific documents selected in the filter and clicks "全部生成"
- **THEN** the system generates test cases only for endpoints in the selected documents

### Requirement: Test case JSON editing
Each test case SHALL be viewable and editable as JSON in a Monaco Editor in the unified test view's right detail panel.

#### Scenario: Edit test case in detail panel
- **WHEN** user clicks on a test case in the unified list
- **THEN** the right panel shows the case JSON in Monaco Editor with save and execute buttons
