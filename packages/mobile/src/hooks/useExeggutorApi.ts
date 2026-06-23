// React Query hooks for Exeggutor backend API.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkspaces, createTab, deleteTab } from '../services/api';

// Fetches all workspaces from the backend.
export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: getWorkspaces,
    refetchInterval: 10000, // Auto-refresh every 10 seconds to detect terminal changes.
  });
}

// Creates a new terminal tab in a workspace and invalidates the workspace cache.
export function useCreateTab() {
  const queryClient = useQueryClient(); // React Query cache manager.

  return useMutation({
    mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) =>
      createTab(workspaceId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

// Deletes a terminal tab and invalidates the workspace cache.
export function useDeleteTab() {
  const queryClient = useQueryClient(); // React Query cache manager.

  return useMutation({
    mutationFn: ({ workspaceId, tabId }: { workspaceId: string; tabId: string }) =>
      deleteTab(workspaceId, tabId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
