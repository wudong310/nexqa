## Context

This is a greenfield project. No existing codebase, no legacy constraints. The user is transitioning from backend development to fullstack, and Nexlab serves as both a practical tool and a learning vehicle.

The project is a web-based HTTP API testing tool that uses LLMs to parse unstructured API documentation and generate test cases. It is architected as an extensible toolbox—API testing is the first module, with room to add more developer utilities over time.

Key constraints:
- All data stored as local JSON files (no database)
- Users provide their own LLM API keys (OpenAI-compatible or Anthropic)
- Must work as a local dev tool (Node.js backend + browser frontend)
- Technology choices must favor actively maintained, modern libraries

## Goals / Non-Goals

**Goals:**
- Deliver a working API testing flow: import docs → LLM parse → confirm → generate cases → execute → save results
- Establish a Shell + Module architecture that supports adding future modules without restructuring
- Provide a clean, modern developer experience with Monaco Editor for JSON editing
- Support OpenAI-compatible endpoints (DeepSeek, Qwen, Moonshot, Ollama, etc.) and Anthropic natively
- Keep deployment simple: `pnpm install && pnpm dev` to start

**Non-Goals:**
- Team collaboration or multi-user support
- Cloud deployment or hosted service
- Support for complex document sites (Notion, Feishu, Yuque SPA rendering)
- CI/CD integration or automated test pipelines
- OpenAPI/Swagger structured schema parsing (LLM handles all document understanding)
- Authentication/authorization for the tool itself

## Decisions

### 1. Monorepo with pnpm workspace

**Choice:** pnpm workspace with `packages/{shared, server, web}` structure.

**Rationale:** Shared Zod schemas and TypeScript types between frontend and backend eliminate duplication and ensure type safety across the stack. pnpm is faster and more disk-efficient than npm/yarn. Turborepo adds unnecessary complexity for a 3-package repo.

**Alternatives considered:**
- Single-package fullstack framework (Next.js, Nuxt): Couples frontend routing to backend, harder to swap UI later
- Separate repos: Loses shared type benefits, complicates development

### 2. Hono for backend

**Choice:** Hono web framework on Node.js.

**Rationale:** TypeScript-first, lightweight (~14KB), excellent middleware ecosystem, Web Standards API compatible. Active development with strong community growth in 2025-2026. Built-in streaming support critical for LLM proxy responses.

**Alternatives considered:**
- Express: Legacy API design, poor TypeScript support, middleware pattern dated
- Fastify: Good but heavier, less ergonomic TypeScript DX than Hono
- Elysia (Bun): Ties us to Bun runtime, smaller ecosystem

### 3. React 19 + Vite 6 for frontend

**Choice:** React 19 with Vite 6 bundler.

**Rationale:** React 19's Server Components and Actions aren't needed here (we have a separate API server), but its improved rendering and Suspense are valuable. Vite 6 provides fast HMR and build times. Both have the largest ecosystems.

**Alternatives considered:**
- Vue 3 + Vite: Viable but React has better Monaco Editor integration and larger component ecosystem
- Svelte 5: Promising but smaller library ecosystem for complex UI needs

### 4. Vercel AI SDK for LLM integration

**Choice:** Vercel AI SDK (`ai` package) for unified LLM provider interface.

**Rationale:** Single API for OpenAI-compatible endpoints and Anthropic. Built-in streaming support (critical for showing LLM responses progressively). Supports custom `baseURL` for OpenAI-compatible providers. Actively maintained by Vercel with weekly releases.

**Alternatives considered:**
- LangChain.js: Too heavy for our needs, abstracts too much
- Direct API calls: Would require maintaining two separate provider implementations and handling streaming manually

### 5. Local JSON file storage

**Choice:** Flat JSON files organized by entity type under `data/` directory.

**Rationale:** Zero setup, easy to inspect/debug, sufficient for single-user local tool. File-per-entity pattern (e.g., `data/projects/{id}.json`) avoids large file reads and simplifies CRUD operations.

**Alternatives considered:**
- SQLite (better-sqlite3): Overkill for single-user, adds native dependency complexity
- IndexedDB (frontend only): Would eliminate backend need but creates CORS issues and limits HTTP testing capability

### 6. Cheerio for URL content fetching (with graceful fallback)

**Choice:** Cheerio for static HTML parsing. If content extraction fails, prompt user to paste content manually.

**Rationale:** Cheerio is lightweight and handles most static documentation sites. Complex SPA sites (Notion, Feishu) would require Puppeteer/Playwright, adding ~300MB+ dependencies and significant complexity. The manual paste fallback keeps the tool simple.

### 7. Biome for linting and formatting

**Choice:** Biome (Rust-based, unified linter + formatter).

**Rationale:** 35x faster than ESLint + Prettier combination. Single tool replaces two. Active development, growing adoption in 2025-2026. Good TypeScript and React support out of the box.

### 8. Shell + Module UI architecture

**Choice:** Top-level Shell component with route-based module loading. Modules are route subtrees under dedicated prefixes (e.g., `/api-tester/*`).

**Rationale:** Adding a new module means adding a new route prefix and navigation item. No changes to existing modules needed. Shared services (LLM config, storage) live in the Shell context and are accessible to all modules.

### 9. Two-step LLM document processing

**Choice:** Step 1: LLM extracts structured API definitions from documents. Step 2: User confirms/edits. Step 3: LLM generates test cases from confirmed definitions.

**Rationale:** LLM parsing of unstructured documents is inherently imprecise. The confirmation step gives users a chance to correct misunderstandings before test cases are generated, avoiding cascading errors.

## Risks / Trade-offs

- **[LLM output variability]** → Structured output with Zod schema validation. Retry with adjusted prompts on parse failures. Show raw LLM output for debugging.
- **[URL fetching limitations]** → Accept that SPA sites won't work. Clear error message with paste-it-yourself fallback. Document known working/failing sites.
- **[Monaco Editor bundle size (~2MB)]** → Lazy-load the editor component. Only load it on pages that need JSON editing. Acceptable trade-off for the editing experience it provides.
- **[File storage scalability]** → Fine for hundreds of test cases per project. If a user hits thousands, consider migrating to SQLite in a future version. Not a concern for v1.
- **[CORS when executing API tests]** → All test HTTP requests go through the Hono backend proxy, avoiding browser CORS restrictions entirely.
