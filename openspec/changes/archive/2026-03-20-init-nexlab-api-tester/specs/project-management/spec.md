## ADDED Requirements

### Requirement: Create project
Users SHALL be able to create a project with a name, base URL, and optional shared headers (e.g., Authorization).

#### Scenario: Create a new project
- **WHEN** user fills in project name "My Backend API" and base URL `https://api.example.com` and clicks "Create"
- **THEN** a project JSON file is created at `data/projects/{id}.json` and the project appears in the project list

### Requirement: Edit project settings
Users SHALL be able to edit a project's name, base URL, and shared headers after creation.

#### Scenario: Update base URL
- **WHEN** user changes the base URL from `https://api.example.com` to `https://staging.example.com`
- **THEN** the change is persisted and all subsequent test executions for this project use the new base URL

### Requirement: Project-scoped data
API docs, test cases, and test results SHALL be associated with a project. Each project acts as a namespace for its data.

#### Scenario: View project contents
- **WHEN** user opens a project
- **THEN** the project detail page shows its associated API docs, aggregated test case counts, and recent test results

### Requirement: Project list with recent activity
The project list SHALL show all projects sorted by last accessed time, with summary information (doc count, last test run date).

#### Scenario: View project list
- **WHEN** user navigates to `/api-tester/projects`
- **THEN** all projects are listed with name, base URL, number of API docs, and last activity timestamp

### Requirement: Delete project
Users SHALL be able to delete a project and all its associated data (API docs, test cases, results).

#### Scenario: Delete project with confirmation
- **WHEN** user clicks "Delete" on a project and confirms the action
- **THEN** the project file and all associated data files are removed from disk
