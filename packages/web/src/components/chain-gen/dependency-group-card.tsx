import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DependencyEdge, DependencyGraph, DependencyNode } from "@/types/chain-gen";
import { Boxes } from "lucide-react";
import { useMemo } from "react";

// ── Grouping Logic ──────────────────────────────────

interface ResourceGroup {
  resourceName: string;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  variables: { name: string; expression: string }[];
}

function guessResource(path: string): string {
  // "POST /api/users/:id" → "Users"
  const segments = path.replace(/^(GET|POST|PUT|PATCH|DELETE)\s*/i, "").split("/").filter(Boolean);
  for (const seg of segments) {
    if (seg.startsWith(":") || seg.startsWith("{") || seg === "api") continue;
    // capitalize
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }
  return "Other";
}

function groupByResource(graph: DependencyGraph): ResourceGroup[] {
  const groupMap = new Map<string, ResourceGroup>();

  for (const node of graph.nodes) {
    const resource = guessResource(node.path);
    if (!groupMap.has(resource)) {
      groupMap.set(resource, {
        resourceName: resource,
        nodes: [],
        edges: [],
        variables: [],
      });
    }
    groupMap.get(resource)!.nodes.push(node);
  }

  // Assign edges to groups based on `from` node
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.find((n) => n.endpointId === edge.from);
    if (!fromNode) continue;
    const resource = guessResource(fromNode.path);
    const group = groupMap.get(resource);
    if (group) {
      group.edges.push(edge);
      if (!group.variables.find((v) => v.name === edge.variable)) {
        group.variables.push({
          name: edge.variable,
          expression: edge.fromExpression,
        });
      }
    }
  }

  return Array.from(groupMap.values()).filter(
    (g) => g.edges.length > 0 || g.nodes.length > 1,
  );
}

// ── Components ──────────────────────────────────────

function DependencyGroupCard({ group }: { group: ResourceGroup }) {
  // Build a readable edge display: "POST /users ──userId──▸ GET /users/:id"
  const nodeMap = useMemo(() => {
    const m = new Map<string, DependencyNode>();
    for (const n of group.nodes) m.set(n.endpointId, n);
    return m;
  }, [group.nodes]);

  return (
    <Card className="border-violet-200/50 dark:border-violet-800/50">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Boxes className="h-4 w-4 text-violet-500" />
          资源组: {group.resourceName}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* Dependency edges as text arrows */}
        <div className="space-y-1.5">
          {group.edges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            return (
              <div
                key={`${edge.from}-${edge.to}-${edge.variable}-${i}`}
                className="flex items-center gap-2 text-xs font-mono flex-wrap"
              >
                <span className="text-muted-foreground truncate max-w-[160px]">
                  {fromNode?.path ?? edge.from}
                </span>
                <span className="flex items-center gap-0.5 text-violet-500 shrink-0">
                  ──
                  <span className="text-[10px] bg-violet-100 dark:bg-violet-900/50 px-1 rounded">
                    {edge.variable}
                  </span>
                  ──▸
                </span>
                <span className="text-foreground truncate max-w-[160px]">
                  {toNode?.path ?? edge.to}
                </span>
              </div>
            );
          })}
        </div>

        {/* Variable summary */}
        {group.variables.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-[10px] text-muted-foreground">
              变量:{" "}
              {group.variables
                .map((v) => `${v.name} (${v.expression})`)
                .join(", ")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Export ──────────────────────────────────────

interface DependencyViewProps {
  graph: DependencyGraph;
}

export function DependencyView({ graph }: DependencyViewProps) {
  const groups = useMemo(() => groupByResource(graph), [graph]);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        未发现 API 间的数据依赖关系
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <DependencyGroupCard key={group.resourceName} group={group} />
      ))}
    </div>
  );
}
