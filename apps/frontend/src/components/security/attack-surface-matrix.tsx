import { MethodBadge } from "@/components/ui/method-badge";
import { cn } from "@/lib/utils";
import type { AttackSurfaceResponse } from "@/types/security";

const cellConfig = {
  vulnerable: { className: "bg-red-500", title: "发现漏洞" },
  safe: { className: "bg-amber-400", title: "已测试/安全" },
  na: { className: "bg-muted", title: "不适用" },
};

interface AttackSurfaceMatrixProps {
  data: AttackSurfaceResponse;
  onCellClick?: (endpoint: string, attackType: string) => void;
}

export function AttackSurfaceMatrix({
  data,
  onCellClick,
}: AttackSurfaceMatrixProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left py-2 px-2 font-medium text-muted-foreground sticky left-0 bg-background">
                接口
              </th>
              {data.attackTypes.map((at) => (
                <th
                  key={at.type}
                  className="py-2 px-2 font-medium text-muted-foreground text-center min-w-[56px]"
                >
                  {at.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.endpoints.map((ep) => (
              <tr key={`${ep.method}-${ep.path}`} className="border-t">
                <td className="py-2 px-2 font-mono whitespace-nowrap sticky left-0 bg-background">
                  <span className="flex items-center gap-1.5">
                    <MethodBadge method={ep.method} />
                    <span>{ep.path}</span>
                  </span>
                </td>
                {data.attackTypes.map((at) => {
                  const cellKey = `${ep.method}:${ep.path}:${at.type}`;
                  const status = data.cells[cellKey] || "na";
                  const cfg = cellConfig[status];
                  return (
                    <td key={at.type} className="py-2 px-2 text-center">
                      <button
                        type="button"
                        className={cn(
                          "h-5 w-5 rounded-full mx-auto block transition-transform hover:scale-125",
                          cfg.className,
                          status !== "na"
                            ? "cursor-pointer"
                            : "cursor-default",
                        )}
                        title={cfg.title}
                        onClick={() =>
                          status !== "na" &&
                          onCellClick?.(
                            `${ep.method} ${ep.path}`,
                            at.type,
                          )
                        }
                        aria-label={`${ep.method} ${ep.path} - ${at.label}: ${cfg.title}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span>发现漏洞</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <span>已测试/安全</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-muted" />
          <span>不适用</span>
        </div>
      </div>
    </div>
  );
}
