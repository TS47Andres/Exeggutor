// Terminal screen for Exeggutor Mobile.
// Uses a native React Native terminal view with direct WebSocket I/O.

import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, useWindowDimensions, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useWorkspaces } from '../../../../src/hooks/useExeggutorApi';
import { connectTerminal, TerminalConnection } from '../../../../src/services/websocket';
import { loadConnection } from '../../../../src/storage/secureStore';

// Strips ANSI escape sequences from terminal output for plain text display.
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][0-9;]*\x07/g, '');
}

// Renders the full-screen terminal with voice input and tab switching.
export default function TerminalScreen() {
  const { workspaceId, tabId } = useLocalSearchParams<{ workspaceId: string; tabId: string }>(); // Route parameters identifying the workspace and terminal tab.
  const { data: workspaces } = useWorkspaces(); // Workspace list for finding tab metadata.
  const webSocketRef = useRef<TerminalConnection | null>(null); // Active WebSocket connection controller.
  const [selectedTabId, setSelectedTabId] = useState(tabId); // Currently active terminal tab.
  const [isConnected, setIsConnected] = useState(false); // WebSocket connection state.
  const [output, setOutput] = useState<string[]>([]); // Terminal output lines displayed in the scroll view.
  const [input, setInput] = useState(''); // Current text in the input field.
  const [showTabPicker, setShowTabPicker] = useState(false); // Whether the tab dropdown is visible.
  const scrollViewRef = useRef<ScrollView>(null); // Reference to auto-scroll on new output.
  const inputRef = useRef<TextInput>(null); // Reference to focus the input field.

  // Connect to the terminal WebSocket when the tab changes.
  useEffect(() => {
    let cancelled = false; // Cleanup flag to prevent stale state updates.
    setOutput([]);
    setIsConnected(false);

    connectTerminal(selectedTabId, (data: string) => {
      if (cancelled) { return; }
      const cleaned = stripAnsi(data).trim(); // Terminal output with escape sequences removed.
      if (cleaned) {
        setOutput((prev) => [...prev.slice(-500), cleaned]); // Keep last 500 lines maximum.
      }
    }).then((conn) => {
      if (cancelled) { conn.close(); return; }
      webSocketRef.current = conn;
      setIsConnected(true);
      // Request a directory listing or similar initial output.
      conn.send(JSON.stringify({ type: 'input', data: '\r' }));
    }).catch(() => {
      if (!cancelled) {
        setOutput((prev) => [...prev, 'Error: Could not connect to terminal.']);
      }
    });

    return () => {
      cancelled = true;
      if (webSocketRef.current) {
        webSocketRef.current.close();
        webSocketRef.current = null;
      }
    };
  }, [selectedTabId]);

  // Auto-scroll to bottom when new output arrives.
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [output]);

  // Sends input to the terminal when the user presses return.
  function handleSubmitEditing() {
    if (!input.trim() || !webSocketRef.current || !isConnected) { return; }
    const cmd = input + '\n'; // Append newline to execute the command.
    webSocketRef.current.send(JSON.stringify({ type: 'input', data: cmd }));
    setOutput((prev) => [...prev, `$ ${input}`]); // Echo the command locally.
    setInput('');
  }

  // Finds the current workspace and active tab for display.
  const workspace = workspaces?.find((w) => w.id === workspaceId);
  const activeTab = workspace?.tabs.find((t) => t.id === selectedTabId || t.id === tabId);

  // Switches to a different terminal tab.
  function switchTab(newTabId: string) {
    setSelectedTabId(newTabId);
    setShowTabPicker(false);
  }

  const terminalView = (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* Tab Switcher Bar */}
      {workspace && workspace.tabs.length > 1 && (
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tabSelector} onPress={() => setShowTabPicker(!showTabPicker)}>
            <Text style={styles.tabSelectorText} numberOfLines={1}>{activeTab?.name || 'Terminal'}</Text>
            <Text style={styles.tabSelectorArrow}>{showTabPicker ? '\u25b2' : '\u25bc'}</Text>
          </TouchableOpacity>
          {showTabPicker && (
            <View style={styles.tabDropdown}>
              {workspace.tabs.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.tabDropdownItem, t.id === selectedTabId && styles.tabDropdownItemActive]} onPress={() => switchTab(t.id)}>
                  <Text style={[styles.tabDropdownText, t.id === selectedTabId && styles.tabDropdownTextActive]}>{t.name}</Text>
                  {t.branch && <Text style={styles.tabDropdownBranch}>{t.branch}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Terminal Output Area */}
      <View style={styles.terminalArea}>
        <ScrollView ref={scrollViewRef} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {output.length === 0 && !isConnected && (
            <Text style={styles.connectingText}>Connecting to terminal...</Text>
          )}
          {output.map((line, i) => (
            <Text key={i} style={styles.outputLine} selectable>{line}</Text>
          ))}
        </ScrollView>

        {/* Connection indicator */}
        <View style={[styles.statusBar, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
          <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
        </View>
      </View>

      {/* Input Row */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSubmitEditing}
          placeholder={isConnected ? 'Enter command...' : 'Connecting...'}
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          editable={isConnected}
        />
      </View>
    </KeyboardAvoidingView>
  );
  return terminalView;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  tabBar: { backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#27272a', zIndex: 10 },
  tabSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tabSelectorText: { flex: 1, color: '#f4f4f5', fontSize: 14, fontWeight: '600', marginRight: 8 },
  tabSelectorArrow: { color: '#71717a', fontSize: 10 },
  tabDropdown: { backgroundColor: '#18181b', borderBottomWidth: 1, borderBottomColor: '#27272a' },
  tabDropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  tabDropdownItemActive: { backgroundColor: '#27272a' },
  tabDropdownText: { color: '#a1a1aa', fontSize: 14 },
  tabDropdownTextActive: { color: '#f4f4f5', fontWeight: '600' },
  tabDropdownBranch: { color: '#71717a', fontSize: 11, marginTop: 2 },
  terminalArea: { flex: 1, position: 'relative' },
  scrollView: { flex: 1, padding: 8 },
  scrollContent: { paddingBottom: 8 },
  connectingText: { color: '#555', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  outputLine: { color: '#f4f4f5', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 18 },
  statusBar: { height: 24, justifyContent: 'center', alignItems: 'center' },
  statusConnected: { backgroundColor: '#22c55e' },
  statusDisconnected: { backgroundColor: '#ef4444' },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  inputRow: { borderTopWidth: 1, borderTopColor: '#27272a', padding: 8, backgroundColor: '#0a0a0a' },
  input: { backgroundColor: '#18181b', borderRadius: 8, padding: 12, color: '#f4f4f5', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
