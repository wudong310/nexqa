import { getTraceId } from "@/lib/logger";

/**
 * 流式调用 /test-cases/generate 并解析 SSE 返回的用例数据
 */
export async function doStreamGenerate(
  eps: Array<{ id: string; method: string; path: string; [k: string]: unknown }>,
  tags?: string[],
): Promise<
  { name: string; request: unknown; expected: unknown; tags: string[] }[]
> {
  const res = await fetch("/nexqa/api/test-cases/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trace-id": getTraceId(),
    },
    body: JSON.stringify({
      endpoints: eps,
      tags: tags?.length ? tags : undefined,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    const rawMsg = errBody.error || `生成失败 (${res.status})`;
    const msg = /LLM not configured/i.test(rawMsg)
      ? "尚未配置 AI 模型，请前往全局设置页面配置"
      : rawMsg;
    throw new Error(msg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No stream");

  let fullText = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }
  } catch (streamErr) {
    if (!fullText.trim()) {
      throw new Error(
        `流式读取中断: ${streamErr instanceof Error ? streamErr.message : String(streamErr)}`,
      );
    }
    console.warn("流式读取中断，尝试使用已接收内容", streamErr);
  }

  if (fullText.includes('"finishReason":"length"')) {
    throw new Error("LLM 输出被截断，生成内容不完整。");
  }

  const lines = fullText.split("\n").filter((l) => l.startsWith("0:"));
  const parts = lines.map((l) => {
    try {
      return JSON.parse(l.slice(2));
    } catch {
      return "";
    }
  });
  const jsonStr = parts
    .join("")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return JSON.parse(jsonStr) as {
    name: string;
    request: unknown;
    expected: unknown;
    tags: string[];
  }[];
}
