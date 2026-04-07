## MODIFIED Requirements

### Requirement: Sidebar navigation
The app SHALL display a persistent left sidebar with a project switcher dropdown at the top and context-aware navigation items based on the selected project. A "全局设置" link SHALL always be present.

#### Scenario: Navigation between project functions
- **WHEN** user clicks "API 测试" in the sidebar
- **THEN** the main content area loads `/p/$projectId/api` without full page reload

#### Scenario: Active function highlighting
- **WHEN** user is on `/p/$projectId/openclaw`
- **THEN** the "OpenClaw" sidebar item is visually highlighted as active

### Requirement: Module slot system
The Shell SHALL use a project-scoped route system where all functional pages are nested under `/p/$projectId/`. The `/settings` route remains project-independent.

#### Scenario: Route structure
- **WHEN** user navigates to `/p/abc-123/api`
- **THEN** the sidebar shows project "abc-123" as selected and "API 测试" as active

## REMOVED Requirements

### Requirement: Dashboard home page
**Reason**: Replaced by project selection page. The dashboard showed module cards and recent projects but added an unnecessary step before reaching actual functionality.
**Migration**: Root route `/` now serves as project selection/redirect page.
