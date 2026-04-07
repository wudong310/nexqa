## ADDED Requirements

### Requirement: OpenClaw connection configuration
Users SHALL be able to configure multiple OpenClaw Gateway connections per project. Each connection MUST include a name, gateway URL (ws:// or wss://), authentication token, test message (default "你好"), and timeout settings (connect/handshake/chat with defaults 5000/5000/30000 ms).

#### Scenario: Add a new OpenClaw connection
- **WHEN** user clicks "添加连接" on the OpenClaw page and fills in name "生产网关", gateway URL "ws://10.0.0.1:18789", token, and clicks "保存"
- **THEN** the connection is persisted in the project's `openclawConnections` array and appears in the connection list

#### Scenario: Add connection with custom timeout
- **WHEN** user expands "高级设置" in the connection dialog and sets chat timeout to 60000ms
- **THEN** the custom timeout is saved and used during connection tests

### Requirement: Edit OpenClaw connection
Users SHALL be able to edit any field of an existing OpenClaw connection via a dialog.

#### Scenario: Update gateway URL
- **WHEN** user clicks "编辑" on a connection and changes the gateway URL
- **THEN** the updated URL is persisted and used in subsequent connection tests

### Requirement: Delete OpenClaw connection
Users SHALL be able to delete an OpenClaw connection from a project.

#### Scenario: Delete a connection
- **WHEN** user clicks "删除" on a connection and confirms
- **THEN** the connection is removed from the project's `openclawConnections` array

### Requirement: Three-phase connection test
The system SHALL execute a three-phase connection test against an OpenClaw Gateway: (1) WebSocket connection, (2) authentication handshake, (3) chat message roundtrip. Each phase MUST report success/failure status and duration. If a phase fails, subsequent phases MUST be marked as "skipped".

#### Scenario: All three phases succeed
- **WHEN** user clicks "测试连接" and gateway is reachable with valid token
- **THEN** all three phases show success with durations, and the AI reply text is displayed

#### Scenario: WebSocket connection fails
- **WHEN** user clicks "测试连接" but the gateway URL is unreachable
- **THEN** phase 1 shows failure with error message, phases 2 and 3 show "跳过"

#### Scenario: Authentication fails
- **WHEN** user clicks "测试连接" but the token is invalid
- **THEN** phase 1 shows success, phase 2 shows failure with error, phase 3 shows "跳过"

#### Scenario: Chat roundtrip times out
- **WHEN** user clicks "测试连接" but AI does not respond within the configured chat timeout
- **THEN** phases 1 and 2 show success, phase 3 shows failure with timeout error

### Requirement: WebSocket handshake protocol
The connect handshake MUST use protocol version 3 with role "operator", scopes ["operator.admin"], client mode "backend", and client ID "nexlab-client". The system MUST wait for a challenge frame before sending the connect request.

#### Scenario: Successful handshake
- **WHEN** the system sends a connect frame with valid token after receiving challenge
- **THEN** gateway responds with protocol version 3 and tick interval configuration

### Requirement: Chat test message
The system MUST send a chat.send request using the user-configured test message with session key `agent:main:webchat:default:dm:nexlab-test`. The system MUST collect streaming delta events and wait for the final event to complete the test.

#### Scenario: Receive streaming reply
- **WHEN** chat.send returns started and delta events arrive followed by a final event
- **THEN** the system assembles the full reply text and reports success with the reply content (truncated to 500 characters)

### Requirement: OpenClaw management page
The system SHALL provide a dedicated page at `/projects/$projectId/openclaw` for managing OpenClaw connections. The project detail page MUST include a navigation entry to this page.

#### Scenario: Navigate to OpenClaw page
- **WHEN** user clicks "OpenClaw 连接" on the project detail page
- **THEN** the system navigates to the OpenClaw connection management page showing all configured connections

#### Scenario: Empty state
- **WHEN** user navigates to the OpenClaw page with no connections configured
- **THEN** the page shows an empty state message prompting to add a connection
