import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EnvironmentState {
  /** Currently selected environment ID (per project) */
  selectedEnvIds: Record<string, string>;
  /** Set selected environment for a project */
  setSelectedEnv: (projectId: string, envId: string) => void;
  /** Get selected environment for a project */
  getSelectedEnv: (projectId: string) => string | null;
  /** Clear selected environment for a project */
  clearSelectedEnv: (projectId: string) => void;
}

export const useEnvironmentStore = create<EnvironmentState>()(
  persist(
    (set, get) => ({
      selectedEnvIds: {},
      setSelectedEnv: (projectId, envId) =>
        set((state) => ({
          selectedEnvIds: { ...state.selectedEnvIds, [projectId]: envId },
        })),
      getSelectedEnv: (projectId) => get().selectedEnvIds[projectId] ?? null,
      clearSelectedEnv: (projectId) =>
        set((state) => {
          const { [projectId]: _, ...rest } = state.selectedEnvIds;
          return { selectedEnvIds: rest };
        }),
    }),
    {
      name: "nexqa-environment",
    },
  ),
);
