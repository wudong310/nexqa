import type { ApiEndpoint, TestCase } from "@nexqa/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

interface UseApiTestShortcutsOptions {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  selectedCase: TestCase | null;
  selectedEndpoint: ApiEndpoint | null;
  editorValue: string;
  execMutation: UseMutationResult<unknown, Error, TestCase, unknown>;
  endpoints: ApiEndpoint[];
  generatePending: boolean;
  onGenerateSelected: () => void;
  onClearCase: () => void;
  onClearEndpoint: () => void;
}

export function useApiTestShortcuts({
  searchInputRef,
  selectedCase,
  selectedEndpoint,
  editorValue,
  execMutation,
  endpoints,
  generatePending,
  onGenerateSelected,
  onClearCase,
  onClearEndpoint,
}: UseApiTestShortcutsOptions) {
  const handleSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, [searchInputRef]);

  const handleSend = useCallback(() => {
    if (selectedCase && !execMutation.isPending) {
      try {
        const parsed = JSON.parse(editorValue);
        execMutation.mutate({
          ...selectedCase,
          request: parsed.request,
          expected: parsed.expected,
        });
      } catch {
        execMutation.mutate(selectedCase);
      }
    }
  }, [selectedCase, editorValue, execMutation]);

  const handleNewCase = useCallback(() => {
    if (endpoints.length > 0 && !generatePending) {
      onGenerateSelected();
    }
  }, [endpoints, generatePending, onGenerateSelected]);

  const handleClose = useCallback(() => {
    if (selectedCase) onClearCase();
    else if (selectedEndpoint) onClearEndpoint();
  }, [selectedCase, selectedEndpoint, onClearCase, onClearEndpoint]);

  useKeyboardShortcuts({
    search: handleSearch,
    send: handleSend,
    "new-case": handleNewCase,
    close: handleClose,
  });
}
