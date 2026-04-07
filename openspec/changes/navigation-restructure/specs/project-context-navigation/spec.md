## ADDED Requirements

### Requirement: Project switcher dropdown
The sidebar SHALL display a project switcher dropdown at the top. The dropdown MUST show all projects, a "新建项目" action, and a "管理项目" link to `/projects`.

#### Scenario: Switch project
- **WHEN** user selects a different project from the dropdown
- **THEN** the system navigates to `/p/$newProjectId/api` and updates localStorage `lastProjectId`

#### Scenario: Create project from dropdown
- **WHEN** user clicks "新建项目" in the dropdown
- **THEN** a create project dialog opens; after creation, the system navigates to the new project

### Requirement: Context-aware sidebar menu
The sidebar MUST render a dynamic function menu based on the currently selected project. Menu items SHALL include: API 测试, 执行历史, OpenClaw, 项目设置. A "全局设置" link SHALL always be present at the bottom.

#### Scenario: Sidebar reflects current project
- **WHEN** user is on `/p/$projectId/api`
- **THEN** the sidebar shows "API 测试" as active, and all menu links point to routes under `/p/$projectId/`

#### Scenario: No project selected
- **WHEN** user is on `/` or `/projects` (no project context)
- **THEN** the sidebar shows only the project switcher (with prompt to select) and "全局设置"

### Requirement: Project selection homepage
The root route `/` SHALL serve as the project selection page. If `lastProjectId` exists in localStorage and the project is valid, the page SHALL redirect to `/p/$lastProjectId/api`. Otherwise, it SHALL display a project selection UI.

#### Scenario: First visit with no projects
- **WHEN** user visits `/` with no projects created
- **THEN** the page shows an empty state with a "创建项目" button

#### Scenario: Return visit with last project
- **WHEN** user visits `/` and localStorage contains a valid `lastProjectId`
- **THEN** the page redirects to `/p/$lastProjectId/api`

#### Scenario: Return visit with invalid last project
- **WHEN** user visits `/` and localStorage `lastProjectId` points to a deleted project
- **THEN** the page shows the project selection UI instead of redirecting

### Requirement: Last project memory
The system SHALL persist the last used project ID in localStorage under key `lastProjectId`. It MUST be updated whenever the user switches projects or navigates to a project page.

#### Scenario: Persist on navigation
- **WHEN** user navigates to any `/p/$projectId/*` route
- **THEN** localStorage `lastProjectId` is updated to `$projectId`
