## ADDED Requirements

### Requirement: Sidebar navigation
The app SHALL display a persistent left sidebar with navigation items for each registered module and a link to global settings.

#### Scenario: Navigation between modules
- **WHEN** user clicks a module item in the sidebar
- **THEN** the main content area loads that module's root page without full page reload

#### Scenario: Active module highlighting
- **WHEN** user is on a page within a module
- **THEN** the corresponding sidebar item is visually highlighted as active

### Requirement: Module slot system
The Shell SHALL provide a route-based module slot system where each module owns a URL prefix (e.g., `/api-tester/*`) and registers its own sub-routes.

#### Scenario: Module route isolation
- **WHEN** a new module is added with prefix `/new-module`
- **THEN** existing module routes under `/api-tester` remain unaffected

### Requirement: LLM provider configuration
The app SHALL provide a settings page where users configure their LLM provider with: provider type (OpenAI-compatible or Anthropic), API key, model name, and optional base URL.

#### Scenario: Configure OpenAI-compatible provider
- **WHEN** user selects "OpenAI Compatible" provider and enters base URL `https://api.deepseek.com/v1`, API key, and model `deepseek-chat`
- **THEN** the configuration is persisted to `data/settings.json` and used for all subsequent LLM calls

#### Scenario: Configure Anthropic provider
- **WHEN** user selects "Anthropic" provider and enters API key and model `claude-sonnet-4-20250514`
- **THEN** the configuration is persisted and used for all subsequent LLM calls

#### Scenario: Missing LLM configuration warning
- **WHEN** user attempts an LLM-dependent action without configured provider
- **THEN** the app SHALL display a prompt directing them to the settings page

### Requirement: Theme support
The app SHALL support light, dark, and system-follow theme modes.

#### Scenario: Switch theme
- **WHEN** user selects "Dark" theme in settings
- **THEN** the entire UI immediately renders with the dark color scheme and the preference is persisted

### Requirement: Dashboard home page
The app SHALL display a dashboard at `/` showing available modules as cards and a list of recently accessed projects.

#### Scenario: View dashboard
- **WHEN** user navigates to `/`
- **THEN** the page displays module cards (API Tester, and placeholder cards for future modules) and up to 10 recent projects sorted by last accessed time
