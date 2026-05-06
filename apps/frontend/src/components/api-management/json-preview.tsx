interface JsonPreviewProps {
  data: unknown;
  maxHeight?: string;
}

export function JsonPreview({ data, maxHeight = "200px" }: JsonPreviewProps) {
  if (data === undefined || data === null) {
    return (
      <p className="text-xs text-muted-foreground/60 italic">无</p>
    );
  }

  const formatted =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <pre
      className="text-xs font-mono bg-muted/30 border rounded-md p-3 overflow-auto whitespace-pre-wrap break-all"
      style={{ maxHeight }}
    >
      {formatted}
    </pre>
  );
}
