// Root layout for the Exeggutor Mobile app.
// Provides auth-aware routing: shows pairing screen if no credentials, main app otherwise.

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { hasConnection } from '../src/storage/secureStore';

// Determines the initial route based on stored connection credentials.
export default function RootLayout() {
  const [isReady, setIsReady] = useState(false); // Whether the auth state check has completed.
  const [isPaired, setIsPaired] = useState(false); // Whether stored connection credentials exist.

  useEffect(() => {
    hasConnection().then((connected) => {
      setIsPaired(connected);
      setIsReady(true);
    });
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
        <ActivityIndicator size="large" color="#f4f4f5" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
        {isPaired ? (
          <Stack.Screen name="(app)" />
        ) : (
          <Stack.Screen name="index" />
        )}
      </Stack>
    </>
  );
}
