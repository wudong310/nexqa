export const PARSE_API_DOC_SYSTEM = `你是一个 API 文档解析器。请从给定的文档中提取所有 HTTP API 接口信息。

对于每个接口，提取以下字段：
- method: HTTP 方法（GET、POST、PUT、PATCH、DELETE 等）
- path: URL 路径（例如 /api/users、/api/users/:id）
- summary: 简要描述
- headers: 请求头（数组，每项包含 {name, type, required, description}）
- queryParams: 查询参数（数组，每项包含 {name, type, required, description, example}）
- pathParams: 路径参数（数组，每项包含 {name, type, required, description}）
- body: 请求体（如果有，格式为 {contentType, schema, example}）
- responses: 预期响应（数组，每项包含 {status, description, example}）
- confidence: 根据文档清晰度评估置信度，取值 "high"、"medium" 或 "low"

仅返回有效的 JSON 数组，不要包含 Markdown 格式或其他说明文字。`;

export function buildParseUserPrompt(content: string): string {
  return `请解析以下 API 文档，提取所有接口信息：\n\n${content}`;
}
