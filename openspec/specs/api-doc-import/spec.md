## ADDED Requirements

### Requirement: Import via Markdown paste
The system SHALL accept raw Markdown text pasted into a text area as API documentation input.

#### Scenario: Paste Markdown content
- **WHEN** user pastes Markdown content describing API endpoints into the import text area and clicks "Parse"
- **THEN** the system sends the content to the configured LLM for structured extraction

### Requirement: Import via file upload
The system SHALL accept `.md` and `.txt` file uploads as API documentation input.

#### Scenario: Upload Markdown file
- **WHEN** user uploads a `.md` file via the file input
- **THEN** the file content is read and sent to the LLM for structured extraction

### Requirement: Import via URL fetch
The system SHALL accept a URL, fetch its content via the backend, and extract text for LLM processing.

#### Scenario: Fetch URL content successfully
- **WHEN** user enters a URL and clicks "Fetch"
- **THEN** the backend fetches the URL content, extracts readable text using Cheerio, and sends it to the LLM for parsing

#### Scenario: URL fetch failure with fallback
- **WHEN** the backend fails to fetch or extract meaningful content from the URL
- **THEN** the system SHALL display an error message and suggest the user copy-paste the content manually

### Requirement: LLM-powered endpoint extraction
The system SHALL use the configured LLM to extract structured API endpoint definitions from unstructured document content. The extracted data SHALL include: HTTP method, path, summary, headers, query parameters, path parameters, request body schema, and example responses.

#### Scenario: Successful extraction
- **WHEN** LLM processes the document content
- **THEN** the system displays a list of extracted endpoints with their details in an editable view

#### Scenario: Partial extraction with warnings
- **WHEN** LLM cannot confidently determine some endpoint parameters
- **THEN** those fields are marked with a warning indicator and the user can fill in missing details

### Requirement: Endpoint confirmation and editing
The system SHALL display extracted endpoints for user review. Users MUST be able to edit any field (method, path, params, body schema) before confirming. The confirmed API definition is saved as an ApiDoc entity.

#### Scenario: Edit and confirm endpoints
- **WHEN** user modifies an extracted endpoint's path from `/user` to `/users` and clicks "Confirm"
- **THEN** the corrected endpoint definition is saved to `data/api-docs/{id}.json` with status `confirmed`

#### Scenario: Re-parse document
- **WHEN** user clicks "Re-parse" after reviewing extraction results
- **THEN** the system sends the original document content to the LLM again for a fresh extraction
