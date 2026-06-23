// Pairing screen — the entry point for first-time setup.
// Users can scan a QR code or manually enter the server connection details.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { verifyPairing } from '../src/services/api';
import { saveConnection } from '../src/storage/secureStore';

// Initial setup screen where the user pairs the mobile app with an Exeggutor server.
export default function PairingScreen() {
  const [host, setHost] = useState(''); // Tailscale IP or hostname entered by the user.
  const [port, setPort] = useState('17492'); // Backend port number.
  const [token, setToken] = useState(''); // Auth token from the server's config.
  const [hostname, setHostname] = useState(''); // Optional display name for the server.
  const [isConnecting, setIsConnecting] = useState(false); // Connection attempt state flag.
  const [error, setError] = useState(''); // Last connection error message.

  // Attempts to connect to the backend with the provided credentials.
  async function handleConnect() {
    if (!host.trim() || !port.trim() || !token.trim()) {
      setError('Host, port, and token are required.');
      return;
    }
    setIsConnecting(true);
    setError('');
    try {
      const valid = await verifyPairing(host.trim(), port.trim(), token.trim());
      if (!valid) {
        setError('Could not verify connection. Check that the server is running in Tailscale mode and try again.');
        setIsConnecting(false);
        return;
      }
      await saveConnection(host.trim(), port.trim(), token.trim(), hostname.trim() || 'Exeggutor');
      router.replace('/(app)');
    } catch (err: any) {
      setError(err.message || 'Connection failed. Ensure both devices are on the same Tailscale tailnet.');
    } finally {
      setIsConnecting(false);
    }
  }

  // Placeholder for QR code scanning (requires expo-camera).
  async function handleScanQR() {
    try {
      const CameraModule = require('expo-camera'); // Camera module for QR scanning.
      const { status } = await CameraModule.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera permission required', 'QR scanning needs camera access.');
        return;
      }
      // Navigate to a QR scanner screen or open inline scanner.
      Alert.alert('QR Scanning', 'Point the camera at the pairing QR code shown by "exeggutor --tailscale-pair" on the server.');
    } catch {
      Alert.alert('Not available', 'QR scanning is not available on this device.');
    }
  }

  const pairingView = (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Text style={styles.title}>Exeggutor Mobile</Text>
          <Text style={styles.subtitle}>Connect to your remote terminal server</Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.label}>Server Address (Tailscale IP)</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="100.x.y.z"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="17492"
            placeholderTextColor="#555"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Auth Token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Paste auth token from ~/.exeggutor.json"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={styles.label}>Display Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={hostname}
            onChangeText={setHostname}
            placeholder="My Dev Machine"
            placeholderTextColor="#555"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.primaryButton} onPress={handleConnect} disabled={isConnecting}>
            <Text style={styles.primaryButtonText}>{isConnecting ? 'Connecting...' : 'Connect'}</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleScanQR}>
            <Text style={styles.secondaryButtonText}>Scan QR Code</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Setup Instructions</Text>
          <Text style={styles.helpText}>
            1. Install Tailscale on both devices (tailscale.com/download){'\n'}
            2. Sign into the same Tailscale account on both{'\n'}
            3. On the server, run: exeggutor --tailscale-pair{'\n'}
            4. Scan the QR code or enter the details manually
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
  return pairingView;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f4f4f5',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 8,
    textAlign: 'center',
  },
  formSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#f4f4f5',
  },
  primaryButton: {
    backgroundColor: '#f4f4f5',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#f4f4f5',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#27272a',
  },
  dividerText: {
    color: '#71717a',
    marginHorizontal: 12,
    fontSize: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 8,
  },
  helpSection: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a1a1aa',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helpText: {
    fontSize: 12,
    color: '#71717a',
    lineHeight: 20,
  },
});
