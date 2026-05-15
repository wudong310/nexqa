import { randomUUID } from "node:crypto";
import type { LogEntry, TestCase } from "@nexqa/shared";
import type {
  CaseGenTask,
  StartCaseGenRequest,
  CaseGenResult,
  GeneratedCase,
} from "@nexqa/shared";
import { createLogger } from "./logger.js";
import type { OpenClawBackendClient, SessionEvent } from "./openclaw-client.js";
import { storage } from "./storage.js";

export interface EventBroadcaster {
  broadcast: (event: unknown) => void;
}

export class CaseGenV2Service {
  private log = createLogger("case-gen-v2");
  private openclawClient: OpenClawBackendClient;
  private eventBroadcaster?: EventBroadcaster;

  constructor(
    openclawClient: OpenClawBackendClient,
    eventBroadcaster?: EventBroadcaster,
  ) {
    this.openclawClient = openclawClient;
    this.eventBroadcaster = eventBroadcaster;
  }

  updateBroadcaster(broadcaster: EventBroadcaster): void {
    this.eventBroadcaster = broadcaster;
  }

  async startGeneration(
    request: StartCaseGenRequest & { projectId: string },
  ): Promise<CaseGenTask> {
    if (!request.projectId) throw new Error("projectId 不能为空");
    if (!request.openclawConnectionId)
      throw new Error("openclawConnectionId 不能为空");
    if (!request.endpointIds || request.endpointIds.length === 0)
      throw new Error("endpointIds 不能为空");
    if (!request.maxCasesPerEndpoint || request.maxCasesPerEndpoint <= 0)
      throw new Error("maxCasesPerEndpoint 必须大于0");

    const id = randomUUID();
    const now = new Date().toISOString();

    const task: CaseGenTask = {
      id,
      projectId: request.projectId,
      status: "pending",
      openclawConnectionId: request.openclawConnectionId,
      endpointIds: request.endpointIds,
      maxCasesPerEndpoint: request.maxCasesPerEndpoint,
      result: null,
      error: null,
      logs: [],
      startedAt: now,
      completedAt: null,
    };

    await storage.write<CaseGenTask>("case-gen-tasks", id, task);
    this.log.info(`用例生成任务已创建: id=${id}, projectId=${request.projectId}`);

    this.executeGeneration(id).catch((err) => {
      this.log.error(
        `用例生成异步执行异常: id=${id}`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return task;
  }

  async getTask(id: string): Promise<CaseGenTask | null> {
    return storage.read<CaseGenTask>("case-gen-tasks", id);
  }

  async listTasks(projectId: string): Promise<CaseGenTask[]> {
    const all = await storage.list<CaseGenTask>("case-gen-tasks");
    return all.filter((t) => t.projectId === projectId);
  }

  async submitResult(taskId: string, result: CaseGenResult): Promise<void> {
    const task = await storage.read<CaseGenTask>("case-gen-tasks", taskId);
    if (!task) throw new Error("任务不存在");

    task.status = "completed";
    task.result = result;
    task.error = null;
    task.completedAt = new Date().toISOString();

    await storage.write("case-gen-tasks", taskId, task);
  }

  async adoptCases(taskId: string, caseIds: string[]): Promise<{ adopted: number }> {
    const task = await storage.read<CaseGenTask>("case-gen-tasks", taskId);
    if (!task?.result) throw new Error("task不存在或未完成");

    const toAdopt = task.result.cases.filter((c) => caseIds.includes(c.id));
    for (const gc of toAdopt) {
      const tc: TestCase = {
        id: randomUUID(),
        endpointId: gc.endpointId,
        name: gc.name,
        request: gc.request,
        expected: gc.expected,
        tags: gc.tags,
        generationSource: "ai" as const,
        isLocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await storage.write("test-cases", tc.id, tc);
    }

    return { adopted: toAdopt.length };
  }

  private async executeGeneration(id: string): Promise<void> {
    const task = await storage.read<CaseGenTask>("case-gen-tasks", id);
    if (!task) {
      this.log.error(`任务不存在: id=${id}`);
      return;
    }

    task.status = "generating";
    await storage.write("case-gen-tasks", id, task);
    this.log.info(`开始生成用例: id=${id}`);

    let unsubscribe: (() => void) | null = null;

    try {
      const taskMessage = await this.buildAgentTaskMessage(task);
      const sessionKey = `case-gen-${task.id}`;

      await this.openclawClient.connect();

      unsubscribe = await this.openclawClient.subscribeToSession({
        key: sessionKey,
        onEvent: (event) => {
          this.handleAgentEvent(id, event);
        },
      });

      await new Promise((r) => setTimeout(r, 100));

      const { sessionId } = await this.openclawClient.createSession({
        agentId: "nexqa",
        key: sessionKey,
        initialMessage: taskMessage,
      });

      this.log.info(`Session 已创建: sessionId=${sessionId}, agentId=nexqa`);

      setTimeout(
        () => {
          this.cleanupSession(id, unsubscribe);
        },
        30 * 60 * 1000,
      );
    } catch (err) {
      task.status = "failed";
      task.error = this.classifyError(err);
      task.completedAt = new Date().toISOString();
      await storage.write("case-gen-tasks", id, task);
      this.log.error(`用例生成失败: id=${id}, error="${task.error}"`);
    }
  }

  private async buildAgentTaskMessage(task: CaseGenTask): Promise<string> {
    const allEndpoints = await storage.list<any>("api-endpoints");
    const endpoints = allEndpoints.filter((e) => task.endpointIds.includes(e.id));

    const allCases = await storage.list<TestCase>("test-cases");
    const existingCases = allCases.filter(
      (c) => c.endpointId && task.endpointIds.includes(c.endpointId),
    );

    const parts: string[] = [
      `## 用例生成任务`,
      ``,
      `- 任务ID: ${task.id}`,
      `- 项目ID: ${task.projectId}`,
      `- 每端点上限: ${task.maxCasesPerEndpoint}`,
      ``,
      `## 端点定义`,
      "```json",
      JSON.stringify(
        endpoints.map((e) => ({
          id: e.id,
          method: e.method,
          path: e.path,
          summary: e.summary || "",
          params: e.queryParams || [],
          pathParams: e.pathParams || [],
          body: e.body,
          responses: e.responses || [],
        })),
        null,
        2,
      ),
      "```",
      ``,
      `## 已有用例（避免重复）`,
      existingCases.length > 0
        ? existingCases
            .map((c) => `- ${c.name} (${c.request.method} ${c.request.path})`)
            .join("\n")
        : "无",
      ``,
      `## 结果提交`,
      `生成完成后，使用 submit-cases 工具提交。`,
    ];

    return parts.join("\n");
  }

  private async cleanupSession(
    taskId: string,
    unsubscribe: (() => void) | null,
  ): Promise<void> {
    const task = await storage.read<CaseGenTask>("case-gen-tasks", taskId);

    if (task && task.status === "generating") {
      task.status = "failed";
      task.error = "生成超时（30分钟）";
      task.completedAt = new Date().toISOString();
      await storage.write("case-gen-tasks", taskId, task);
      this.log.warn(`Session 超时清理: taskId=${taskId}`);
    }

    if (unsubscribe) unsubscribe();

    try {
      this.openclawClient.disconnect();
    } catch {
      // ignore
    }
  }

  private handleAgentEvent(taskId: string, event: SessionEvent): void {
    const text = this.extractText(event.message);
    const toolCalls = event.toolCalls as
      | Array<{ name?: string; input?: unknown; result?: unknown }>
      | undefined;

    let toolName: string | undefined;
    let toolInput: Record<string, unknown> | undefined;
    let toolResult: unknown;

    if (toolCalls && toolCalls.length > 0) {
      const firstCall = toolCalls[0];
      toolName = firstCall.name;
      toolInput =
        firstCall.input && typeof firstCall.input === "object"
          ? (firstCall.input as Record<string, unknown>)
          : undefined;
      toolResult = firstCall.result;
    }

    const logEntry: LogEntry = {
      event: event.state as string,
      text,
      timestamp: new Date().toISOString(),
    };

    this.persistLog(taskId, logEntry).catch((err) => {
      this.log.error(`日志持久化失败: taskId=${taskId}`, err);
    });

    this.eventBroadcaster?.broadcast({
      type: "case-gen-v2:event",
      payload: {
        taskId,
        event: event.state as
          | "delta"
          | "tool_use"
          | "tool_result"
          | "final"
          | "error",
        data: {
          text,
          toolName,
          toolInput,
          result: toolResult,
        },
        timestamp: logEntry.timestamp,
      },
    });

    if (event.state === "final") {
      this.log.info(`Agent final 事件: taskId=${taskId}, text.length=${text.length}`);
      return;
    }

    if (event.state === "error") {
      void this.persistError(taskId, event);
    }
  }

  private async persistLog(taskId: string, logEntry: LogEntry): Promise<void> {
    const task = await storage.read<CaseGenTask>("case-gen-tasks", taskId);
    if (!task) return;

    if (!task.logs) task.logs = [];
    task.logs.push(logEntry);

    await storage.write("case-gen-tasks", taskId, task);
  }

  private async persistError(taskId: string, event: SessionEvent): Promise<void> {
    const task = await storage.read<CaseGenTask>("case-gen-tasks", taskId);
    if (!task) return;
    task.status = "failed";
    task.error = `Agent 错误: ${this.extractText(event.message) || "未知错误"}`;
    task.completedAt = new Date().toISOString();
    await storage.write("case-gen-tasks", taskId, task);
  }

  private extractText(message: unknown): string {
    if (!message || typeof message !== "object") return "";
    const m = message as Record<string, unknown>;
    if (Array.isArray(m.content)) {
      return (m.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("");
    }
    if (typeof m.text === "string") return m.text;
    if (typeof m.content === "string") return m.content;
    return "";
  }

  private classifyError(err: unknown): string {
    if (!(err instanceof Error)) {
      return `未知错误: ${String(err)}`;
    }

    const msg = err.message;

    if (msg.includes("超时") || msg.includes("timeout")) {
      return `spawn session 超时: ${msg}`;
    }

    if (msg.includes("连接") || msg.includes("WebSocket") || msg.includes("connect")) {
      return `OpenClaw 连接失败: ${msg}`;
    }

    return `生成失败: ${msg}`;
  }
}
