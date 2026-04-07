## 1. Project Scaffolding

- [x] 1.1 Initialize pnpm workspace with `packages/{shared, server, web}` structure, root `pnpm-workspace.yaml`, and root `tsconfig.json`
- [x] 1.2 Set up `packages/shared`: package.json, tsconfig, Zod schemas for all entities (Settings, Project, ApiDoc, Endpoint, TestCase, TestResult)
- [x] 1.3 Set up `packages/server`: Hono app entry, tsconfig, dev script with hot reload
- [x] 1.4 Set up `packages/web`: React 19 + Vite 6 + TypeScript, configure path aliases to shared package
- [x] 1.5 Configure Biome for linting and formatting across the monorepo
- [x] 1.6 Add `.gitignore` (node_modules, dist, data/)

## 2. App Shell — Backend

- [x] 2.1 Implement file-based storage service: read/write/list/delete JSON files under `data/` directory
- [x] 2.2 Implement settings API routes (`GET /api/settings`, `PUT /api/settings`) for persisting LLM config and theme preference
- [x] 2.3 Implement LLM proxy service using Vercel AI SDK: accept provider config from settings, support OpenAI-compatible (`createOpenAI` with custom baseURL) and Anthropic (`createAnthropic`)
- [x] 2.4 Implement streaming LLM endpoint (`POST /api/llm/chat`) that proxies requests to the configured provider with SSE streaming

## 3. App Shell — Frontend

- [x] 3.1 Install and configure shadcn/ui (Radix + Tailwind CSS v4), set up base theme with light/dark/system support
- [x] 3.2 Set up TanStack Router with root layout, sidebar navigation component, and module route prefixes
- [x] 3.3 Build Dashboard page at `/` with module cards and recent projects list
- [x] 3.4 Build Settings page at `/settings` with LLM provider configuration form (provider type select, API key input, base URL input, model name input) and theme switcher
- [x] 3.5 Set up Zustand store for global state (settings, sidebar collapse state) and TanStack Query for server state

## 4. Project Management

- [x] 4.1 Implement project CRUD API routes (`POST /api/projects`, `GET /api/projects`, `GET /api/projects/:id`, `PUT /api/projects/:id`, `DELETE /api/projects/:id`)
- [x] 4.2 Build project list page at `/api-tester/projects` with project cards showing name, base URL, doc count, last activity
- [x] 4.3 Build create/edit project dialog with name, base URL, and shared headers (key-value pairs) inputs
- [x] 4.4 Implement project delete with confirmation dialog and cascade deletion of associated data files

## 5. API Document Import

- [x] 5.1 Implement URL content fetching endpoint (`POST /api/fetch-url`) using Cheerio to extract readable text from HTML; return error with fallback message on failure
- [x] 5.2 Implement LLM endpoint extraction endpoint (`POST /api/api-docs/parse`) that sends document content to LLM with a structured prompt and returns parsed endpoints as JSON
- [x] 5.3 Implement API doc CRUD routes (`POST /api/api-docs`, `GET /api/api-docs?projectId=`, `GET /api/api-docs/:id`, `PUT /api/api-docs/:id`, `DELETE /api/api-docs/:id`)
- [x] 5.4 Build import page at `/api-tester/projects/:id/import` with three input modes: Markdown paste textarea, file upload (.md/.txt), and URL input with fetch button
- [x] 5.5 Build endpoint review/confirmation UI: display LLM-extracted endpoints in editable form, allow field editing, show warning indicators on low-confidence fields, provide "Confirm" and "Re-parse" actions
- [x] 5.6 Wire up confirmed API doc saving with status `confirmed` to backend

## 6. Test Case Generation

- [x] 6.1 Implement LLM test case generation endpoint (`POST /api/test-cases/generate`) that takes confirmed endpoint definitions and returns generated test cases as JSON array
- [x] 6.2 Implement test case CRUD routes (`POST /api/test-cases`, `GET /api/test-cases?apiDocId=`, `GET /api/test-cases/:id`, `PUT /api/test-cases/:id`, `DELETE /api/test-cases/:id`)
- [x] 6.3 Build test case list view at `/api-tester/projects/:id/docs/:docId/cases` showing cases grouped by endpoint with name, method, expected status
- [x] 6.4 Integrate Monaco Editor for test case JSON editing with JSON syntax validation and schema-aware autocompletion
- [x] 6.5 Implement "Generate Test Cases" button per endpoint and "Generate All" button per API doc, with loading/streaming progress indication
- [x] 6.6 Implement test case tagging: add/remove tags UI and filtering by tags in the list view

## 7. Test Execution

- [x] 7.1 Implement test execution endpoint (`POST /api/test/exec`) that receives a test case definition, sends the HTTP request via undici through the backend, and returns the full response with timing
- [x] 7.2 Implement pass/fail evaluation logic: compare actual status code against expected, evaluate body assertions, generate failReason on mismatch
- [x] 7.3 Implement test result persistence routes (`POST /api/test-results`, `GET /api/test-results?projectId=`, `GET /api/test-results/:id`)
- [x] 7.4 Build single test execution UI: "Execute" button on each test case, display response status/body/duration inline, show pass/fail indicator
- [x] 7.5 Build batch execution UI: "Run All" button with sequential execution, progress bar, and summary (total/passed/failed)
- [x] 7.6 Build test history page at `/api-tester/projects/:id/docs/:docId/results` with chronological list of runs, pass rate, and drill-down to side-by-side request/response view in read-only Monaco Editors

## 8. Polish and Integration

- [x] 8.1 Add loading states, error boundaries, and toast notifications across all pages
- [x] 8.2 Add responsive sidebar collapse behavior
- [x] 8.3 Wire up Dashboard recent projects from actual project data sorted by last accessed timestamp
- [x] 8.4 Add project base URL and shared headers auto-injection into test case requests during execution
- [x] 8.5 Write Vitest unit tests for shared Zod schemas, storage service, and pass/fail evaluation logic
- [x] 8.6 Verify full end-to-end flow: create project → import doc → confirm endpoints → generate cases → edit case → execute → view results
