// Workspace list screen.
// Shows all available workspaces from the backend and allows navigation to terminals.

import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { router } from 'expo-router';
import { useWorkspaces } from '../../src/hooks/useExeggutorApi';

// Renders the list of workspaces with terminal counts and navigation.
export default function WorkspacesScreen() {
  const { data: workspaces, isLoading, isError, refetch, isRefetching } = useWorkspaces(); // Remote workspaces list.
  const [selectedTabIds, setSelectedTabIds] = useState<Record<string, string>>({}); // Maps workspace ID to the currently selected tab ID for the terminal screen.

  // Navigates to the terminal screen for the given workspace and tab.
  function openTerminal(workspaceId: string, tabId: string) {
    router.push(`/(app)/terminal/${workspaceId}/${tabId}`);
  }

  if (isLoading) {
    const loadingView = (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#f4f4f5" />
        <Text style={styles.loadingText}>Loading workspaces...</Text>
      </View>
    );
    return loadingView;
  }

  if (isError) {
    const errorView = (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load workspaces.</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
    return errorView;
  }

  if (!workspaces || workspaces.length === 0) {
    const emptyView = (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyTitle}>No Workspaces</Text>
        <Text style={styles.emptySubtitle}>Create a workspace on the server using the desktop dashboard.</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
    return emptyView;
  }

  const workspaceListView = (
    <FlatList
      data={workspaces}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#f4f4f5" />}
      renderItem={({ item: ws }) => (
        <View style={styles.workspaceCard}>
          <View style={styles.workspaceHeader}>
            <View style={styles.workspaceInfo}>
              <Text style={styles.workspaceName}>{ws.name}</Text>
              <Text style={styles.workspacePath}>{ws.path}</Text>
            </View>
            <Text style={styles.tabCount}>{ws.tabs.length} tab{ws.tabs.length !== 1 ? 's' : ''}</Text>
          </View>

          {ws.tabs.length === 0 ? (
            <Text style={styles.noTabs}>No terminals in this workspace.</Text>
          ) : (
            ws.tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabRow}
                onPress={() => openTerminal(ws.id, tab.id)}
              >
                <View style={styles.tabInfo}>
                  <Text style={styles.tabName}>{tab.name}</Text>
                  {tab.branch && <Text style={styles.tabBranch}>branch: {tab.branch}</Text>}
                </View>
                <Text style={styles.tabArrow}>{'>'}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    />
  );
  return workspaceListView;
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  loadingText: {
    color: '#71717a',
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryText: {
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f4f4f5',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
  },
  workspaceCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 12,
    overflow: 'hidden',
  },
  workspaceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  workspaceInfo: {
    flex: 1,
    marginRight: 12,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f4f4f5',
  },
  workspacePath: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tabCount: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  noTabs: {
    padding: 16,
    color: '#71717a',
    fontSize: 13,
    textAlign: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  tabInfo: {
    flex: 1,
    marginRight: 12,
  },
  tabName: {
    fontSize: 14,
    color: '#f4f4f5',
    fontWeight: '500',
  },
  tabBranch: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 2,
  },
  tabArrow: {
    color: '#555',
    fontSize: 16,
  },
});
