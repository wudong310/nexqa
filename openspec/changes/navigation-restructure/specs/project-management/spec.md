## MODIFIED Requirements

### Requirement: Project-scoped data
API docs, test cases, test results, and OpenClaw connections SHALL be associated with a project. Each project acts as a namespace for its data.

#### Scenario: View project contents
- **WHEN** user selects a project via the sidebar switcher
- **THEN** all functional pages (API 测试, OpenClaw, 执行历史) show data scoped to that project

### Requirement: Project list with recent activity
The project list SHALL be accessible via `/projects` (from the sidebar dropdown "管理项目") and show all projects sorted by last accessed time.

#### Scenario: View project list
- **WHEN** user clicks "管理项目" in the project switcher dropdown
- **THEN** the system navigates to `/projects` showing all projects with name, base URL, and last activity

### Requirement: Edit project settings
Users SHALL be able to edit a project's name, base URL, shared headers, and OpenClaw connections on a dedicated project settings page at `/p/$projectId/settings`.

#### Scenario: Edit project on settings page
- **WHEN** user navigates to `/p/$projectId/settings`
- **THEN** a form displays the project's current settings (name, baseURL, headers, OpenClaw connections) with save functionality

## REMOVED Requirements

### Requirement: Project detail overview page
**Reason**: Replaced by context-aware sidebar navigation. The project detail page was a pass-through that required extra clicks to reach actual functionality.
**Migration**: Functions previously accessed via project detail page are now directly accessible from sidebar menu items.
