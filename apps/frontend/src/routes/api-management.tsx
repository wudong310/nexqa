import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useApiDocuments,
  useDeleteApiDocument,
  useDeleteApiEndpoint,
} from "@/hooks/use-api-documents";
import { apiDocumentsApi } from "@/lib/api-documents";
import type { ApiDocument } from "@nexqa/shared";
import type { ApiEndpointWithCaseCount } from "@/types/api-management";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  FileText,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DocumentCard } from "@/components/api-management/document-card";
import { EndpointListItem } from "@/components/api-management/endpoint-list-item";
import { EndpointDetailSheet } from "@/components/api-management/endpoint-detail-sheet";
import { ImportApiDocSheet } from "@/components/api-management/import-api-doc-sheet";

export function ApiManagementPage() {
  const { projectId } = useParams({ from: "/p/$projectId/api-management" });

  // ── Data ──
  const {
    data: documents,
    isLoading,
    error,
    refetch,
  } = useApiDocuments(projectId);

  const deleteDocMutation = useDeleteApiDocument();
  const deleteEpMutation = useDeleteApiEndpoint();

  // ── UI state ──
  const [importOpen, setImportOpen] = useState(false);
  const [updateDocId, setUpdateDocId] = useState<string | undefined>();
  const [updateDocName, setUpdateDocName] = useState<string | undefined>();
  const [detailEndpointId, setDetailEndpointId] = useState<string | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<ApiDocument | null>(null);
  const [confirmDeleteEpId, setConfirmDeleteEpId] = useState<string | null>(null);

  function handleOpenImport(docId?: string, docName?: string) {
    setUpdateDocId(docId);
    setUpdateDocName(docName);
    setImportOpen(true);
  }

  function handleDeleteDoc(doc: ApiDocument) {
    setConfirmDeleteDoc(doc);
  }

  async function confirmDeleteDocument() {
    if (!confirmDeleteDoc) return;
    try {
      await deleteDocMutation.mutateAsync(confirmDeleteDoc.id);
      toast.success(`文档「${confirmDeleteDoc.name}」已删除`);
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setConfirmDeleteDoc(null);
    }
  }

  function handleDeleteEndpoint(epId: string) {
    setConfirmDeleteEpId(epId);
  }

  async function confirmDeleteEndpoint() {
    if (!confirmDeleteEpId) return;
    try {
      await deleteEpMutation.mutateAsync(confirmDeleteEpId);
      toast.success("端点已删除");
      setDetailEndpointId(null);
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setConfirmDeleteEpId(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold">API 管理</h1>
          <p className="text-sm text-muted-foreground">
            管理 API 文档、查看端点、追踪变更
          </p>
        </div>
        <Button size="sm" onClick={() => handleOpenImport()}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          导入 API
        </Button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto space-y-3">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-4 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border rounded-lg p-6">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">加载失败</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              无法获取 API 列表，请检查网络连接后重试
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              重试
            </Button>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && documents && documents.length === 0 && (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title="还没有导入 API 文档"
            description="导入 OpenAPI、Swagger、Postman 等格式的 API 文档"
            action={
              <Button onClick={() => handleOpenImport()}>
                <Upload className="h-4 w-4 mr-1" />
                导入 API 文档
              </Button>
            }
          />
        )}

        {/* Document list */}
        {!isLoading &&
          !error &&
          documents &&
          documents.length > 0 &&
          documents.map((doc, idx) => (
            <DocumentCardWithEndpoints
              key={doc.id}
              document={doc}
              defaultOpen={idx === 0}
              onUpdate={() => handleOpenImport(doc.id, doc.name)}
              onDelete={() => handleDeleteDoc(doc)}
              onViewEndpoint={(epId) => setDetailEndpointId(epId)}
              onDeleteEndpoint={handleDeleteEndpoint}
            />
          ))}
      </div>

      {/* ── Sheets & Dialogs ── */}
      <ImportApiDocSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        updateDocumentId={updateDocId}
        updateDocumentName={updateDocName}
        onSuccess={() => refetch()}
      />

      <EndpointDetailSheet
        endpointId={detailEndpointId}
        open={!!detailEndpointId}
        onOpenChange={(open) => {
          if (!open) setDetailEndpointId(null);
        }}
        onDelete={handleDeleteEndpoint}
      />

      {/* Delete document confirmation */}
      <AlertDialog
        open={!!confirmDeleteDoc}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteDoc(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文档</AlertDialogTitle>
            <AlertDialogDescription>
              删除文档「{confirmDeleteDoc?.name}」将同时删除其所有端点。关联的测试用例将标记为"API
              已删除"。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDocument}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete endpoint confirmation */}
      <AlertDialog
        open={!!confirmDeleteEpId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteEpId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除端点</AlertDialogTitle>
            <AlertDialogDescription>
              删除此端点后，关联的测试用例将标记为"API 已删除"。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEndpoint}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Document card with endpoints loaded from server ──

function DocumentCardWithEndpoints({
  document: doc,
  defaultOpen,
  onUpdate,
  onDelete,
  onViewEndpoint,
  onDeleteEndpoint,
}: {
  document: ApiDocument;
  defaultOpen: boolean;
  onUpdate: () => void;
  onDelete: () => void;
  onViewEndpoint: (epId: string) => void;
  onDeleteEndpoint: (epId: string) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["api-document", doc.id],
    queryFn: () => apiDocumentsApi.get(doc.id),
  });

  const endpoints: ApiEndpointWithCaseCount[] = detail?.endpoints ?? [];

  return (
    <DocumentCard
      document={doc}
      defaultOpen={defaultOpen}
      onUpdate={onUpdate}
      onDelete={onDelete}
    >
      {isLoading && (
        <div className="space-y-1 py-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      )}
      {!isLoading && endpoints.length === 0 && (
        <p className="text-xs text-muted-foreground py-3 text-center">
          该文档暂无端点
        </p>
      )}
      {!isLoading &&
        endpoints.map((ep) => (
          <EndpointListItem
            key={ep.id}
            endpoint={ep}
            testCaseCount={ep.testCaseCount}
            onView={() => onViewEndpoint(ep.id)}
            onDelete={() => onDeleteEndpoint(ep.id)}
          />
        ))}
    </DocumentCard>
  );
}
