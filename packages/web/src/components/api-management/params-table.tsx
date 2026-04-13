import type { Param } from "@nexqa/shared";

interface ParamsTableProps {
  params: Param[];
  title: string;
}

export function ParamsTable({ params, title }: ParamsTableProps) {
  if (params.length === 0) {
    return (
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground/60 italic">无</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-3 py-1.5 font-medium">参数名</th>
              <th className="text-left px-3 py-1.5 font-medium">类型</th>
              <th className="text-left px-3 py-1.5 font-medium">必填</th>
              <th className="text-left px-3 py-1.5 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-b last:border-0">
                <td className="px-3 py-1.5 font-mono">{p.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{p.type}</td>
                <td className="px-3 py-1.5">
                  {p.required ? (
                    <span className="text-red-600 dark:text-red-400">是</span>
                  ) : (
                    <span className="text-muted-foreground">否</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">
                  {p.description || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
