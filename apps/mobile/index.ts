/**
 * VERGO Mobile App Entry Point
 */

// IMPORTANT: gesture-handler must be imported first
import 'react-native-gesture-handler';

import React from 'react';
import { registerRootComponent } from 'expo';
import { StyleSheet, Text, View } from 'react-native';

type GlobalErrorUtils = {
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

function formatStartupError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return 'Unknown startup error';
}

function getStartupHint(message: string): string {
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes('native module') ||
    lowerMessage.includes('cannot find native module')
  ) {
    return 'The installed Expo client/dev build is likely out of date for the current native dependencies.';
  }
  return 'Check the Metro terminal and rebuild the client if this persists.';
}

function StartupErrorScreen({ message }: { message: string }) {
  return React.createElement(
    View,
    { style: styles.container },
    React.createElement(Text, { style: styles.title }, 'VERGO failed to start'),
    React.createElement(Text, { style: styles.message }, message),
    React.createElement(Text, { style: styles.hint }, getStartupHint(message))
  );
}

const errorUtils = (global as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
errorUtils?.setGlobalHandler?.((error, isFatal) => {
  console.error('[VERGO] Unhandled runtime error', { isFatal, error });
});

let RootComponent: React.ComponentType;

try {
  console.log('[VERGO] Loading root component');
  RootComponent = require('./App').default as React.ComponentType;
} catch (error) {
  const message = formatStartupError(error);
  console.error('[VERGO] Failed to load App', error);
  function StartupFallbackRoot() {
    return React.createElement(StartupErrorScreen, { message });
  }

  RootComponent = StartupFallbackRoot;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  message: {
    color: '#ffb4b4',
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    color: '#d4af37',
    fontSize: 14,
    lineHeight: 20,
  },
});
