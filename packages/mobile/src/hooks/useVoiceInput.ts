// Hook for speech-to-text voice input using expo-speech-recognition.
// Provides push-to-talk functionality for the terminal screen.

import { useState, useRef, useCallback, useEffect } from 'react';

// Permission and recognition status for voice input.
export interface VoiceInputState {
  isAvailable: boolean; // Whether speech recognition is available on this device.
  isListening: boolean; // Whether the recogniser is currently capturing audio.
  permissionGranted: boolean; // Whether microphone and speech permissions have been granted.
  error: string | null; // Human-readable error message if recognition failed.
}

// Result returned from a completed speech recognition session.
export interface VoiceInputResult {
  text: string; // Transcribed text from the user's speech.
  isFinal: boolean; // Whether this is the final transcription (true) or an interim result.
}

type RecognitionListener = (result: VoiceInputResult) => void;

// Manages the lifecycle of a push-to-talk speech recognition session.
export function useVoiceInput(): VoiceInputState & {
  requestPermissions: () => Promise<boolean>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<string>;
  setOnResult: (listener: RecognitionListener | null) => void;
} {
  const [isAvailable, setIsAvailable] = useState(false); // Whether speech recognition is supported on the current device.
  const [isListening, setIsListening] = useState(false); // Active recording indicator flag.
  const [permissionGranted, setPermissionGranted] = useState(false); // Persisted permission grant status flag.
  const [error, setError] = useState<string | null>(null); // Last speech recognition error message.

  const onResultRef = useRef<RecognitionListener | null>(null); // Callback registered by the consumer for transcription events.
  const finalTranscriptRef = useRef<string>(''); // Accumulated final transcription text for the current session.
  const speechModuleRef = useRef<any>(null); // Cached reference to the expo-speech-recognition module, null if unavailable.

  // Detect availability of speech recognition on mount.
  useEffect(() => {
    try {
      const mod = require('expo-speech-recognition');
      speechModuleRef.current = mod;
      setIsAvailable(true);
    } catch {
      setIsAvailable(false);
    }
  }, []);

  // Requests microphone and speech recognition permissions from the OS.
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const mod = speechModuleRef.current; // Cached speech recognition module.
    if (!mod) {
      setError('Speech recognition is not available on this device.');
      return false;
    }
    try {
      const { status } = await mod.requestPermissionsAsync();
      const granted = status === 'granted'; // Whether the user granted the permission.
      setPermissionGranted(granted);
      return granted;
    } catch {
      setError('Speech recognition permission was denied.');
      return false;
    }
  }, []);

  // Starts a push-to-talk speech recognition session.
  const startListening = useCallback(async (): Promise<void> => {
    const mod = speechModuleRef.current; // Cached speech recognition module.
    if (!mod) {
      setError('Speech recognition is not available on this device.');
      return;
    }
    try {
      finalTranscriptRef.current = '';
      setIsListening(true);
      setError(null);
      await mod.startListeningAsync({
        onResult: (result: any) => {
          if (result.isFinal) {
            finalTranscriptRef.current = result.transcript || '';
          }
          if (onResultRef.current && result.transcript) {
            onResultRef.current({ text: result.transcript, isFinal: result.isFinal ?? false });
          }
        },
        onError: (err: any) => {
          setError(err.message || 'Speech recognition error');
          setIsListening(false);
        },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to start speech recognition');
      setIsListening(false);
    }
  }, []);

  // Stops the current recognition session and returns the final transcribed text.
  const stopListening = useCallback(async (): Promise<string> => {
    const mod = speechModuleRef.current; // Cached speech recognition module.
    if (mod) {
      try {
        await mod.stopListeningAsync();
      } catch {
        // Best-effort stop.
      }
    }
    setIsListening(false);
    return finalTranscriptRef.current;
  }, []);

  // Registers a callback to receive intermediate transcription results.
  const setOnResult = useCallback((listener: RecognitionListener | null) => {
    onResultRef.current = listener;
  }, []);

  return {
    isAvailable,
    isListening,
    permissionGranted,
    error,
    requestPermissions,
    startListening,
    stopListening,
    setOnResult,
  };
}
