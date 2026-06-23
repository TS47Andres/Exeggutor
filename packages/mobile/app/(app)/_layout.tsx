// Layout for authenticated app routes.
// Provides a stack navigator for workspace list and terminal screens.

import { Stack } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { clearConnection } from '../../src/storage/secureStore';

// Wraps authenticated screens with navigation and a disconnect option.
export default function AppLayout() {
  // Clears stored credentials and returns to the pairing screen.
  async function handleDisconnect() {
    await clearConnection();
    router.replace('/');
  }

  const layoutView = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#f4f4f5',
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        contentStyle: { backgroundColor: '#0a0a0a' },
      }}
    >
      <Stack.Screen
        name="workspaces"
        options={{
          title: 'Exeggutor',
          headerRight: () => (
            <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectButton}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="terminal/[workspaceId]/[tabId]"
        options={{
          title: 'Terminal',
          headerBackTitle: 'Workspaces',
        }}
      />
    </Stack>
  );
  return layoutView;
}

const styles = StyleSheet.create({
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  disconnectText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
