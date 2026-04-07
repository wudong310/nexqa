## MODIFIED Requirements

### Requirement: Project-scoped data
API docs, test cases, test results, and OpenClaw connections SHALL be associated with a project. Each project acts as a namespace for its data. The project data model MUST include an optional `openclawConnections` array field.

#### Scenario: View project contents
- **WHEN** user opens a project
- **THEN** the project detail page shows its associated API docs, aggregated test case counts, recent test results, and an OpenClaw 连接 navigation entry

#### Scenario: Project with OpenClaw connections
- **WHEN** user opens a project that has OpenClaw connections configured
- **THEN** the project detail page shows the OpenClaw 连接 entry with the connection count
