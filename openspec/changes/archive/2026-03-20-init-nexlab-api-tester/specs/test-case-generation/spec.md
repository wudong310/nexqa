## ADDED Requirements

### Requirement: AI test case generation
The system SHALL generate HTTP test cases from confirmed API endpoint definitions by sending the structured endpoint data to the configured LLM. Generated cases SHALL cover: normal success paths, missing required parameters, invalid parameter formats, and boundary values.

#### Scenario: Generate test cases for an endpoint
- **WHEN** user selects a confirmed endpoint and clicks "Generate Test Cases"
- **THEN** the LLM generates a set of test cases and displays them in a list, each with a name, request definition, and expected response

#### Scenario: Generate cases for all endpoints
- **WHEN** user clicks "Generate All" on the API doc view
- **THEN** the system generates test cases for every confirmed endpoint in the document

### Requirement: Test case JSON editing
Each test case SHALL be viewable and editable as JSON in a Monaco Editor instance. The JSON structure includes: method, path, headers, query params, body, and expected response (status code, body assertions).

#### Scenario: Edit test case in Monaco Editor
- **WHEN** user clicks on a test case
- **THEN** a Monaco Editor opens showing the full test case JSON, and any edits are reflected in real time

#### Scenario: JSON validation on edit
- **WHEN** user modifies test case JSON with invalid syntax
- **THEN** the Monaco Editor highlights the syntax error and the save button is disabled

### Requirement: Test case persistence
Test cases SHALL be saved as individual JSON files under `data/test-cases/{id}.json`. Each test case references its parent API doc and endpoint index.

#### Scenario: Save generated test cases
- **WHEN** test cases are generated or manually edited
- **THEN** each case is persisted to its own JSON file and can be retrieved on next visit

### Requirement: Test case tagging
Users SHALL be able to assign tags to test cases for filtering and organization.

#### Scenario: Add tags to test case
- **WHEN** user adds tags "smoke" and "auth" to a test case
- **THEN** the tags are saved with the test case and can be used to filter the case list
