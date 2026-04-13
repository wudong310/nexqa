import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MethodBadge } from "@/components/ui/method-badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiDocuments } from "@/hooks/use-api-documents";
import { apiDocumentsApi } from "@/lib/api-documents";
import type { ApiDocument, ApiEndpoint } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

interface ApiSelectorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelect: (endpoint: ApiEndpoint) => void;
}

export function ApiSelectorSheet({
  open,
  onOpenChange,
  projectId,
  onSelect,
}: ApiSelectorSheetProps) {
  const [search, setSearch] = useState("");
  const { data: documents, isLoading: docsLoading } = useApiDocuments(projectId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>选择要关联的 API</SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索 API..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {docsLoading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          )}

          {documents && documents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无可选的 API
            </p>
          )}

          {documents &&
            documents.map((doc) => (
              <DocumentEndpointList
                key={doc.id}
                document={doc}
                search={search}
                onSelect={(ep) => {
                  onSelect(ep);
                  onOpenChange(false);
                }}
              />
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DocumentEndpointList({
  document: doc,
  search,
  onSelect,
}: {
  document: ApiDocument;
  search: string;
  onSelect: (ep: ApiEndpoint) => void;
}) {
  const { data: detail } = useQuery({
    queryKey: ["api-document", doc.id],
    queryFn: () => apiDocumentsApi.get(doc.id),
    enabled: true,
  });

  const filteredEndpoints = useMemo(() => {
    if (!detail?.endpoints) return [];
    const q = search.toLowerCase();
    if (!q) return detail.endpoints;
    return detail.endpoints.filter(
      (ep) =>
        ep.path.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q) ||
        (ep.summary && ep.summary.toLowerCase().includes(q)),
    );
  }, [detail?.endpoints, search]);

  if (filteredEndpoints.length === 0 && search) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground px-1">
        {doc.name}
      </h4>
      <div className="border rounded-md divide-y">
        {filteredEndpoints.map((ep) => (
          <div
            key={ep.id}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(ep)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              (e.key === "Enter" || e.key === " ") && onSelect(ep)
            }
          >
            <MethodBadge method={ep.method} />
            <span className="font-mono text-xs truncate">{ep.path}</span>
            <span className="text-xs text-muted-foreground truncate">
              {ep.summary}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
