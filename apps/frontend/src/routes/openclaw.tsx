import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  OpenClawClient,
  type Attachment,
  type Base64Attachment,
  type ChatMessage,
  type ConnectionStatus,
  type ImageSendMode,
  type ProtocolLogEntry,
  type UrlAttachment,
  isBase64Attachment,
  isUrlAttachment,
} from "@/lib/openclaw-client";
import { ImageSendModeSelector } from "@/components/ImageSendModeSelector";
import type { OpenClawConnection, Project } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eraser,
  ImagePlus,
  Key,
  Loader2,
  MessageSquare,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SessionParamsBar } from "@/components/session-params/SessionParamsBar";
import { useSessionParams } from "@/components/session-params/useSessionParams";
import type { SessionParams, SessionParamChange } from "@/components/session-params/useSessionParams";
import { usePresets } from "@/components/session-params/usePresets";

/* ─── helpers ─── */
function emptyConnection(existingCount: number = 0): Omit<OpenClawConnection, "id"> {
  return {
    name: existingCount === 0 ? "OpenClaw 连接 1" : `OpenClaw 连接 ${existingCount + 1}`,
    gatewayUrl: "",
    clawRunnerUrl: "",
    testMessage: "你好",
    timeout: { connect: 5000, handshake: 10000, chat: 30000 },
  };
}

/** Small dropdown to pick an alternative send mode for retry */
function SwitchModeButton({
  currentMode,
  onSwitch,
}: {
  currentMode?: "direct" | "proxy";
  onSwitch: (mode: "direct" | "proxy") => void;
}) {
  const altMode = currentMode === "proxy" ? "direct" : "proxy";
  const altLabel = altMode === "direct" ? "⚡ 直发" : "☁️ 中转";
  return (
    <button
      type="button"
      className="px-2 py-1 text-[11px] bg-muted text-muted-foreground rounded hover:bg-muted/80 flex items-center gap-1"
      onClick={(e) => {
        e.stopPropagation();
        onSwitch(altMode);
      }}
    >
      切换{altLabel}
    </button>
  );
}

/* ─── main page ─── */
export function OpenClawPage() {
  const { projectId } = useParams({ from: "/p/$projectId/openclaw" });
  const queryClient = useQueryClient();
  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/detail?id=${projectId}`),
  });
  const connections = project?.openclawConnections || [];

  /* dialog edit state */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnId, setEditingConnId] = useState<string | null>(null); // null = adding new, string = editing
  const [form, setForm] = useState(emptyConnection());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OpenClawConnection | null>(null);

  /* chat state */
  const [selectedConn, setSelectedConn] = useState<OpenClawConnection | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<ProtocolLogEntry[]>([]);
  const [agentActivity, setAgentActivity] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageSendMode, setImageSendMode] = useState<ImageSendMode>("auto");
  const [sending, setSending] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [logTab, setLogTab] = useState<"current" | "all">("current");
  const clientRef = useRef<OpenClawClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* session params state */
  const { params: sessionParams, updateParam, setAllParams, sessionKey } = useSessionParams(selectedConn);
  const { presets, addPreset, removePreset, setDefaultPreset, getDefaultPreset, matchPreset } = usePresets(selectedConn?.id ?? null);
  const activePresetId = matchPreset(sessionParams);

  /* Sync session key override to client when params change */
  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.setSessionKeyOverride(sessionKey);
      clientRef.current.setSenderNameOverride(sessionParams.senderName || null);
    }
  }, [sessionKey, sessionParams.senderName]);

  /* Auto-apply default preset when connection is selected */
  const appliedDefaultRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedConn) return;
    const defaultPreset = getDefaultPreset();
    if (defaultPreset && appliedDefaultRef.current !== selectedConn.id) {
      appliedDefaultRef.current = selectedConn.id;
      setAllParams(defaultPreset.params);
    }
  }, [selectedConn, getDefaultPreset, setAllParams]);

  const handleParamChange = useCallback(
    (field: keyof SessionParams, value: string): SessionParamChange | null => {
      const change = updateParam(field, value);
      if (change) {
        const sysMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: `会话参数已更新 ${change.field}: ${change.oldValue || "(空)"} → ${change.newValue || "(空)"}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, sysMsg]);
      }
      return change;
    },
    [updateParam],
  );

  const handleApplyPreset = useCallback(
    (presetParams: SessionParams) => {
      // Collect changes for system message
      const changes: string[] = [];
      for (const key of Object.keys(presetParams) as (keyof SessionParams)[]) {
        if (sessionParams[key] !== presetParams[key]) {
          changes.push(`${key}: ${sessionParams[key] || "(空)"} → ${presetParams[key] || "(空)"}`);
        }
      }
      setAllParams(presetParams);
      if (changes.length > 0) {
        const sysMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: `已应用预设，参数已更新\n${changes.join("\n")}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, sysMsg]);
      }
    },
    [sessionParams, setAllParams],
  );


  /* mutations */
  const saveMutation = useMutation({
    mutationFn: async (payload: { conn: OpenClawConnection; andConnect?: boolean }) => {
      const { conn } = payload;
      const isEditing = editingConnId !== null;
      const updated = isEditing
        ? connections.map((c) => (c.id === editingConnId ? conn : c))
        : [...connections, conn];
      return api.post<Project>('/projects/update', { id: projectId, openclawConnections: updated });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      const isEditing = editingConnId !== null;
      toast.success(isEditing ? "连接已更新" : "连接已添加");
      closeDialog();
      if (variables.andConnect) {
        setSelectedConn(variables.conn);
        // Defer connect to next tick so state has settled
        setTimeout(() => handleConnect(variables.conn), 0);
      }
    },
    onError: (err: Error) => {
      toast.error(`保存失败：${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const updated = connections.filter((c) => c.id !== id);
      return api.post<Project>('/projects/update', { id: projectId, openclawConnections: updated });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("连接已删除");
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error(`删除失败：${err.message}`);
    },
  });

  /* dialog helpers */
  function openCreate() {
    setEditingConnId(null);
    setForm(emptyConnection(connections.length));
    setShowAdvanced(false);
    setDialogOpen(true);
  }
  function openEdit(conn: OpenClawConnection) {
    setEditingConnId(conn.id);
    setForm({
      name: conn.name,
      gatewayUrl: conn.gatewayUrl,
      clawRunnerUrl: conn.clawRunnerUrl,
      testMessage: conn.testMessage,
      timeout: { ...conn.timeout },
    });
    setShowAdvanced(false);
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setEditingConnId(null);
  }
  function handleSave(andConnect?: boolean) {
    const isEditing = editingConnId !== null;
    const conn: OpenClawConnection = {
      id: isEditing ? editingConnId : crypto.randomUUID(),
      ...form,
    } as OpenClawConnection;
    saveMutation.mutate({ conn, andConnect });
  }

  /* scroll to bottom on new messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentActivity]);

  /* cleanup on unmount */
  useEffect(() => {
    return () => { clientRef.current?.disconnect(); };
  }, []);

  /* auto-select and connect when there's only one connection */
  useEffect(() => {
    if (connections.length === 1 && !selectedConn && connectionStatus === "disconnected") {
      const conn = connections[0];
      setSelectedConn(conn);
      handleConnect(conn);
    }
  }, [connections, selectedConn, connectionStatus]);


  /* connect / disconnect */
  function handleConnect(conn: OpenClawConnection) {
    clientRef.current?.disconnect();
    setMessages([]);
    setLogs([]);
    setAgentActivity(null);
    setConnectionStatus("connecting");

    const client = new OpenClawClient(conn, {
      onStatusChange: (s) => {
        setConnectionStatus(s);
        if (s === "connected") toast.success("WebSocket 已连接");
      },
      onLog: (entry) => setLogs((prev) => [...prev, entry]),
      onChatDelta: (runId, text) => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === runId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: text, streaming: true };
            return updated;
          }
          return [...prev, { id: runId, role: "assistant" as const, content: text, timestamp: Date.now(), streaming: true }];
        });
      },
      onChatFinal: (runId, text) => {
        setMessages((prev) => prev.map((m) => (m.id === runId ? { ...m, content: text || m.content, streaming: false } : m)));
        setAgentActivity(null);
      },
      onChatError: (runId, error) => {
        setMessages((prev) => [...prev, { id: runId, role: "system" as const, content: `错误: ${error}`, timestamp: Date.now() }]);
        setAgentActivity(null);
        toast.error(`对话错误：${error}`);
      },
      onChatAborted: (runId) => {
        setMessages((prev) => prev.map((m) => (m.id === runId ? { ...m, streaming: false } : m)));
        setAgentActivity(null);
      },
      onAgentEvent: (act) => setAgentActivity(`🔧 ${act.name} (${act.phase})`),
      onError: (err) => { toast.error(`连接错误：${err}`); },
    });
    clientRef.current = client;
    client.connect();
  }

  function handleDisconnect() {
    clientRef.current?.disconnect();
    clientRef.current = null;
    toast.info("连接已断开");
  }

  /* image handling */
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }
  function clearImage() {
    setSelectedImage(null);
    setImagePreview(null);
  }

  /* send message with mode-aware image handling */
  function buildBase64Attachment(file: File, preview: string): Base64Attachment {
    const dataUrl = preview;
    const commaIdx = dataUrl.indexOf(",");
    const base64Data = dataUrl.substring(commaIdx + 1);
    const mimeType = file.type || dataUrl.substring(5, dataUrl.indexOf(";"));
    return { mimeType, content: base64Data, fileName: file.name };
  }

  async function uploadViaProxy(file: File): Promise<UrlAttachment> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/nexqa/api/openclaw/upload-image", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) {
      return { url: data.url, mime: data.mime };
    }
    throw new Error("上传返回无 URL");
  }

  async function sendWithAttachments(
    file: File,
    preview: string,
    mode: ImageSendMode,
  ): Promise<{ attachments: Attachment[]; actualMode: "direct" | "proxy" }> {
    const SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB

    if (mode === "direct") {
      // Direct only — no fallback
      const att = buildBase64Attachment(file, preview);
      return { attachments: [att], actualMode: "direct" };
    }

    if (mode === "proxy") {
      // Proxy only — no fallback
      const att = await uploadViaProxy(file);
      return { attachments: [att], actualMode: "proxy" };
    }

    // Auto mode: <5MB try direct, ≥5MB try proxy, with fallback
    if (file.size < SIZE_THRESHOLD) {
      try {
        const att = buildBase64Attachment(file, preview);
        return { attachments: [att], actualMode: "direct" };
      } catch {
        toast.warning("直发失败，尝试中转...");
        const att = await uploadViaProxy(file);
        return { attachments: [att], actualMode: "proxy" };
      }
    }

    // ≥5MB: try proxy first, fallback to direct
    try {
      toast.info("图片较大，通过代理发送");
      const att = await uploadViaProxy(file);
      return { attachments: [att], actualMode: "proxy" };
    } catch {
      toast.warning("代理发送失败，回退 base64 方式");
      const att = buildBase64Attachment(file, preview);
      return { attachments: [att], actualMode: "direct" };
    }
  }

  async function handleSend(overrideMode?: ImageSendMode) {
    const text = inputText.trim();
    if (!text && !selectedImage) return;
    if (connectionStatus !== "connected") return;
    setSending(true);

    const currentMode = overrideMode ?? imageSendMode;
    const hasImage = !!(selectedImage && imagePreview);
    const msgId = crypto.randomUUID();

    try {
      let attachments: Attachment[] | undefined;
      let actualMode: "direct" | "proxy" | undefined;

      if (hasImage && selectedImage && imagePreview) {
        const result = await sendWithAttachments(selectedImage, imagePreview, currentMode);
        attachments = result.attachments;
        actualMode = result.actualMode;
      }

      const userMsg: ChatMessage = {
        id: msgId,
        role: "user",
        content: text,
        timestamp: Date.now(),
        attachments,
        sendMode: actualMode,
        sendStatus: hasImage ? "sending" : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      clearImage();

      const viaProxy = actualMode === "proxy";
      if (viaProxy) {
        const urlAttachments = attachments?.filter(isUrlAttachment) as UrlAttachment[] | undefined;
        await clientRef.current?.sendMessageViaProxy(text, urlAttachments);
      } else {
        await clientRef.current?.sendMessage(text, attachments);
      }

      // Mark send success
      if (hasImage) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, sendStatus: "sent" } : m)),
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "发送失败";
      if (hasImage) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, sendStatus: "error", errorMessage: errMsg }
              : m,
          ),
        );
      }
      toast.error(errMsg);
    } finally {
      setSending(false);
    }
  }

  /** Retry sending a failed image message */
  async function handleRetry(msg: ChatMessage) {
    if (!msg.attachments || connectionStatus !== "connected") return;

    // Reset status to sending
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? { ...m, sendStatus: "sending", errorMessage: undefined }
          : m,
      ),
    );

    try {
      const viaProxy = msg.sendMode === "proxy";
      if (viaProxy) {
        const urlAttachments = (msg.attachments ?? []).filter(isUrlAttachment) as UrlAttachment[];
        await clientRef.current?.sendMessageViaProxy(msg.content, urlAttachments);
      } else {
        await clientRef.current?.sendMessage(msg.content, msg.attachments);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, sendStatus: "sent" } : m)),
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, sendStatus: "error", errorMessage: errMsg }
            : m,
        ),
      );
      toast.error(errMsg);
    }
  }

  /** Resend a failed message with a different mode */
  async function handleSwitchModeAndRetry(msg: ChatMessage, newMode: "direct" | "proxy") {
    if (!msg.attachments || connectionStatus !== "connected") return;

    // We need the original file to re-encode. For simplicity,
    // if the attachment is already in the target format, just resend.
    // If we need to convert, we'll use what we have.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? { ...m, sendMode: newMode, sendStatus: "sending", errorMessage: undefined }
          : m,
      ),
    );

    try {
      if (newMode === "proxy") {
        // If we have a base64 attachment, we need to upload it
        const base64Att = (msg.attachments ?? []).find(isBase64Attachment);
        if (base64Att) {
          // Convert base64 to blob and upload
          const blob = await fetch(`data:${base64Att.mimeType};base64,${base64Att.content}`).then(r => r.blob());
          const file = new File([blob], base64Att.fileName || "image.png", { type: base64Att.mimeType });
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/nexqa/api/openclaw/upload-image", { method: "POST", body: fd });
          const data = await res.json();
          if (!data.url) throw new Error("上传返回无 URL");
          const urlAtt: UrlAttachment = { url: data.url, mime: data.mime };
          // Update the attachment and send
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...m, attachments: [urlAtt] } : m,
            ),
          );
          await clientRef.current?.sendMessageViaProxy(msg.content, [urlAtt]);
        } else {
          // Already a URL attachment, just resend
          const urlAttachments = (msg.attachments ?? []).filter(isUrlAttachment) as UrlAttachment[];
          await clientRef.current?.sendMessageViaProxy(msg.content, urlAttachments);
        }
      } else {
        // direct mode — send via WS
        await clientRef.current?.sendMessage(msg.content, msg.attachments);
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, sendStatus: "sent" } : m)),
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, sendStatus: "error", errorMessage: errMsg }
            : m,
        ),
      );
      toast.error(errMsg);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }


  /* status badge */
  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: "bg-red-500",
    connecting: "bg-yellow-500 animate-pulse",
    connected: "bg-green-500",
  };
  const statusLabels: Record<ConnectionStatus, string> = {
    disconnected: "已断开",
    connecting: "连接中...",
    connected: "已连接",
  };

  /* collapse info state */
  const [infoExpanded, setInfoExpanded] = useState(false);

  /* ─── RENDER ─── */
  return (
    <>
    {connections.length === 0 ? (
      /* ─── EMPTY STATE: single column centered ─── */
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <EmptyState
          icon={<Plug className="h-12 w-12" />}
          title="连接 OpenClaw 实例"
          description="通过 WebSocket 连接到 OpenClaw 网关，实时调试 Agent 对话、查看请求响应和工具调用"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              添加第一个连接
            </Button>
          }
          secondaryAction={
            <div className="flex flex-col items-center gap-4">
              {/* 步骤指示器 */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">1</span>
                  <span>填写连接信息</span>
                </div>
                <ChevronRight className="h-3 w-3" />
                <div className="flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center">2</span>
                  <span>测试连通</span>
                </div>
                <ChevronRight className="h-3 w-3" />
                <div className="flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center">3</span>
                  <span>开始调试</span>
                </div>
              </div>
              {/* 折叠说明 */}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setInfoExpanded(!infoExpanded)}
              >
                {infoExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                什么是 OpenClaw 连接？
              </button>
              {infoExpanded && (
                <p className="text-xs text-muted-foreground max-w-sm text-center leading-relaxed">
                  OpenClaw 是一个 AI Agent 运行时框架。通过配置网关地址，您可以在此实时发送消息给 Agent，
                  查看它的思考过程、工具调用和响应内容，方便开发调试。
                </p>
              )}
            </div>
          }
        />
      </div>
    ) : (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ─── LEFT: connection list ─── */}
      <div className="w-72 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">连接列表</h2>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 添加
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`group rounded-md px-3 py-2 cursor-pointer hover:bg-accent transition-colors ${selectedConn?.id === conn.id ? "bg-accent" : ""}`}
              onClick={() => { setSelectedConn(conn); }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{conn.name}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(conn); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setDeleteTarget(conn); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{conn.gatewayUrl}</p>
            </div>
          ))}
        </div>
      </div>


      {/* ─── RIGHT: chat + logs ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConn ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Plug className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>选择一个连接开始调试</p>
            </div>
          </div>
        ) : (
          <>
            {/* top bar */}
            <div className="border-b px-4 py-2 flex items-center justify-between bg-background">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">{selectedConn.name}</h3>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${statusColors[connectionStatus]}`} />
                  <span className="text-xs text-muted-foreground">{statusLabels[connectionStatus]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Clear messages button */}
                {messages.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="清空消息"
                    onClick={() => {
                      if (window.confirm("清空所有消息？连接不会断开。")) {
                        setMessages([]);
                        toast.success("消息已清空");
                      }
                    }}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                )}
                {connectionStatus === "disconnected" ? (
                  <Button size="sm" onClick={() => handleConnect(selectedConn)}>
                    <PlugZap className="h-3.5 w-3.5 mr-1" /> 连接
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleDisconnect}>
                    断开
                  </Button>
                )}
              </div>
            </div>

            {/* session params bar */}
            {selectedConn && (
              <SessionParamsBar
                params={sessionParams}
                onParamChange={handleParamChange}
                onApplyPreset={handleApplyPreset}
                presets={presets}
                activePresetId={activePresetId}
                onSavePreset={(name) => addPreset(name, sessionParams)}
                onRemovePreset={removePreset}
                onSetDefaultPreset={setDefaultPreset}
                connected={connectionStatus === "connected"}
              />
            )}

            {/* messages area */}
            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              {messages.length === 0 && connectionStatus === "connected" && (
                <p className="text-sm text-muted-foreground text-center py-12">连接已建立，发送一条消息开始聊天</p>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : msg.role === "system"
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : "bg-muted"
                    }`}
                  >
                    {msg.attachments?.map((att, i) => {
                      const src = isBase64Attachment(att)
                        ? `data:${att.mimeType};base64,${att.content}`
                        : isUrlAttachment(att)
                          ? att.url
                          : undefined;
                      if (!src) return null;

                      const isSending = msg.sendStatus === "sending";
                      const isError = msg.sendStatus === "error";
                      const isSent = msg.sendStatus === "sent";

                      return (
                        <div key={`att-${i}`} className="relative mb-2 inline-block">
                          <img
                            src={src}
                            alt="attachment"
                            className={`max-w-xs max-h-40 rounded ${isSending ? "opacity-80" : ""}`}
                          />
                          {/* Sending overlay */}
                          {isSending && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 rounded backdrop-blur-[1px]">
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                              <span className="text-white text-xs mt-1">
                                {msg.sendMode === "proxy" ? "☁️ 上传中..." : "⚡ 发送中..."}
                              </span>
                            </div>
                          )}
                          {/* Success badge */}
                          {isSent && msg.sendMode && (
                            <span
                              className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full text-[11px] text-white backdrop-blur-sm ${
                                msg.sendMode === "direct"
                                  ? "bg-amber-500/80"
                                  : "bg-sky-500/80"
                              }`}
                            >
                              {msg.sendMode === "direct" ? "⚡ 直发" : "☁️ 中转"}
                            </span>
                          )}
                          {/* Error overlay */}
                          {isError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 rounded backdrop-blur-[1px]">
                              <AlertCircle className="h-5 w-5 text-destructive" />
                              <span className="text-destructive text-xs font-medium mt-1">发送失败</span>
                              {msg.errorMessage && (
                                <span className="text-destructive/70 text-[10px] mt-0.5 max-w-[90%] text-center truncate">
                                  {msg.errorMessage}
                                </span>
                              )}
                              <div className="flex gap-1.5 mt-2">
                                <button
                                  type="button"
                                  className="px-2 py-1 text-[11px] bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-1"
                                  onClick={(e) => { e.stopPropagation(); handleRetry(msg); }}
                                >
                                  <RefreshCw className="h-3 w-3" /> 重试
                                </button>
                                <SwitchModeButton
                                  currentMode={msg.sendMode}
                                  onSwitch={(newMode) => handleSwitchModeAndRetry(msg, newMode)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {msg.content}
                    {msg.streaming && <span className="inline-block w-1.5 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />}
                  </div>
                </div>
              ))}
              {agentActivity && (
                <div className="flex justify-start">
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">{agentActivity}</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* session key bar removed — now accessible via 🔑 icon in protocol logs header */}

            {/* input area */}
            <div className="border-t p-3 bg-background">
              {imagePreview && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="relative">
                    <img src={imagePreview} alt="preview" className="h-16 w-16 object-cover rounded border" />
                    <button type="button" className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center" onClick={clearImage}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">{selectedImage?.name}</span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                <Button variant="ghost" size="icon" className="shrink-0" disabled={connectionStatus !== "connected"} onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <ImageSendModeSelector
                  mode={imageSendMode}
                  onChange={setImageSendMode}
                  disabled={connectionStatus !== "connected"}
                />
                <textarea
                  className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm min-h-[38px] max-h-32 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder={connectionStatus === "connected" ? "输入消息... (Enter 发送, Shift+Enter 换行)" : "请先连接..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={connectionStatus !== "connected"}
                  rows={1}
                />
                <Button size="icon" className="shrink-0" disabled={connectionStatus !== "connected" || sending || (!inputText.trim() && !selectedImage)} onClick={() => handleSend()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>


            {/* protocol logs panel */}
            <div className="border-t">
              <button
                type="button"
                className="w-full px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                onClick={() => setLogsExpanded(!logsExpanded)}
              >
                <div className="flex items-center gap-1">
                  {logsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>协议日志 ({logs.length})</span>
                  {/* 🔑 SessionKey quick access */}
                  {connectionStatus === "connected" && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="ml-1.5 inline-flex items-center text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await navigator.clipboard.writeText(sessionKey);
                                toast.success("已复制");
                              } catch {
                                toast.error("复制失败");
                              }
                            }}
                            title="复制 sessionKey"
                          >
                            <Key className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm font-mono text-[10px] break-all">
                          {sessionKey}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {logsExpanded && (
                  <button type="button" className="text-xs hover:text-foreground" onClick={(e) => { e.stopPropagation(); setLogs([]); setExpandedLogIds(new Set()); }}>
                    清空
                  </button>
                )}
              </button>
              {logsExpanded && (
                <>
                  {/* Session tab switcher */}
                  <div className="flex items-center gap-0 px-3 pt-1 pb-0.5 border-b">
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs font-medium rounded-t transition-colors ${logTab === "current" ? "bg-background border border-b-0 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setLogTab("current")}
                    >
                      本会话
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-xs font-medium rounded-t transition-colors ${logTab === "all" ? "bg-background border border-b-0 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setLogTab("all")}
                    >
                      全部
                    </button>
                  </div>
                  <div className="h-72 overflow-auto px-3 pb-2 font-mono text-xs space-y-0.5 bg-background">
                    {(() => {
                      const currentSessionKey = sessionKey;
                      const filteredLogs = logTab === "all"
                        ? logs
                        : logs.filter((entry) => !entry.sessionKey || entry.sessionKey === currentSessionKey);
                      return [...filteredLogs].reverse().map((entry) => {
                        const dirStyle = entry.direction === "send" ? "text-blue-600" : entry.direction === "recv" ? "text-green-600" : entry.direction === "error" ? "text-red-600" : "text-muted-foreground";
                        const dirIcon = entry.direction === "send" ? "→" : entry.direction === "recv" ? "←" : entry.direction === "error" ? "✗" : "·";
                        const isExpanded = expandedLogIds.has(entry.id);
                        return (
                          <div key={entry.id}>
                            <div
                              className={`flex gap-2 cursor-pointer hover:bg-muted/30 rounded px-1 ${dirStyle}`}
                              onClick={() => {
                                if (!entry.rawJson) return;
                                setExpandedLogIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(entry.id)) next.delete(entry.id);
                                  else next.add(entry.id);
                                  return next;
                                });
                              }}
                            >
                              <span className="shrink-0 opacity-60 select-none">{entry.ts}</span>
                              <span className="shrink-0 w-4 text-center select-none">{dirIcon}</span>
                              <span className="truncate">{entry.message}</span>
                              {entry.rawJson && <span className="shrink-0 opacity-40 ml-auto">{isExpanded ? "▾" : "▸"}</span>}
                            </div>
                            {isExpanded && entry.rawJson && (
                              <pre className="ml-8 mt-0.5 mb-1 p-2 rounded bg-muted/50 overflow-auto max-h-48 text-[10px] leading-relaxed whitespace-pre-wrap break-all">
                                {(() => {
                                  try { return JSON.stringify(JSON.parse(entry.rawJson), null, 2); }
                                  catch { return entry.rawJson; }
                                })()}
                              </pre>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    )}


      {/* ─── EDIT / CREATE CONNECTION DIALOG ─── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingConnId ? "编辑连接" : "添加连接"}</DialogTitle>
            <DialogDescription>
              {editingConnId ? "修改连接配置" : "配置新的 OpenClaw 连接"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input placeholder="生产网关" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>网关地址</Label>
              <Input placeholder="ws://10.0.0.1:18789" value={form.gatewayUrl} onChange={(e) => setForm({ ...form, gatewayUrl: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>claw-runner 地址</Label>
              <Input placeholder="http://10.0.0.1:4000" value={form.clawRunnerUrl} onChange={(e) => setForm({ ...form, clawRunnerUrl: e.target.value })} />
            </div>
            <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              超时设置
            </button>
            {showAdvanced && (
              <div className="space-y-3 pl-3 border-l-2 border-muted">
                <div className="space-y-1">
                  <Label className="text-sm">连接超时 (ms)</Label>
                  <Input type="number" value={form.timeout.connect} onChange={(e) => setForm({ ...form, timeout: { ...form.timeout, connect: Number(e.target.value) } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">握手超时 (ms)</Label>
                  <Input type="number" value={form.timeout.handshake} onChange={(e) => setForm({ ...form, timeout: { ...form.timeout, handshake: Number(e.target.value) } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">对话超时 (ms)</Label>
                  <Input type="number" value={form.timeout.chat} onChange={(e) => setForm({ ...form, timeout: { ...form.timeout, chat: Number(e.target.value) } })} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            {editingConnId ? (
              <>
                <Button variant="outline" onClick={closeDialog}>取消</Button>
                <Button onClick={() => handleSave(false)} disabled={!form.name || !form.gatewayUrl || !form.clawRunnerUrl || saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  保存
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => handleSave(false)} disabled={!form.name || !form.gatewayUrl || !form.clawRunnerUrl || saveMutation.isPending}>
                  仅添加
                </Button>
                <Button onClick={() => handleSave(true)} disabled={!form.name || !form.gatewayUrl || !form.clawRunnerUrl || saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PlugZap className="h-4 w-4 mr-1" />}
                  添加并连接
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DELETE CONFIRM DIALOG ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除连接</DialogTitle>
            <DialogDescription>确定要删除 &quot;{deleteTarget?.name}&quot; 吗？此操作无法撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  删除中...
                </>
              ) : (
                "删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
