## Why

We need a web-based HTTP API testing tool that leverages LLMs to automatically generate test cases from unstructured API documentation (Markdown, online URLs). Existing tools like Postman require structured input and manual case creation. This tool—**Nexlab**—is designed as an extensible fullstack developer toolbox, with API testing as the first module, supporting future expansion into other developer utilities.

## What Changes

- Create a new monorepo project (Nexlab) with Hono backend + React 19 frontend
- Implement an **API document parser** that uses LLMs to extract structured endpoint definitions from Markdown or fetched URL content
- Implement an **AI test case generator** that produces executable HTTP test cases from parsed API definitions
- Build a **test execution engine** that runs HTTP requests and records results with pass/fail evaluation
- Provide a **Monaco Editor-based UI** for reviewing and editing test cases as JSON
- Store all data (projects, API docs, test cases, results) as local JSON files
- Support user-configured LLM providers (OpenAI-compatible endpoints and Anthropic)
- Design a **Shell + Module architecture** so future non-testing modules can be added without restructuring

## Capabilities

### New Capabilities
- `app-shell`: Global layout with sidebar navigation, settings page, LLM provider configuration, and module slot system for extensibility
- `api-doc-import`: Import API documentation via Markdown paste, file upload, or URL fetch; use LLM to extract structured endpoint definitions with user confirmation/editing
- `test-case-generation`: AI-powered generation of HTTP test cases from confirmed API definitions, with Monaco Editor for manual JSON editing
- `test-execution`: Execute HTTP test cases against target APIs, record request/response details, evaluate pass/fail, and persist results as local files
- `project-management`: Create and manage projects with base URL, shared headers, and associations to API docs, test cases, and results

### Modified Capabilities

## Impact

- New project repository with full monorepo structure (pnpm workspace)
- New npm dependencies: React 19, Vite 6, Hono, Vercel AI SDK, Zustand, TanStack Router/Query, shadcn/ui, Monaco Editor, Zod, Cheerio, undici, Biome
- Local file system used for data storage under `data/` directory
- No external database or deployment infrastructure required
- Users must provide their own LLM API keys
