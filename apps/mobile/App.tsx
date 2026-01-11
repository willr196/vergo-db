/**
 * VERGO Mobile App
 * Main entry point with improved error handling
 */

import React, { useEffect, useRef, useState } from 'react';
import { StatusBar, View, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation';
import { LoadingScreen } from './src/components';
import { useAuthStore } from './src/store';
import { colors, typography, spacing } from './src/theme';

// Auth initialization timeout (5 seconds)
const AUTH_TIMEOUT = 5000;

function AppContent() {
  const { checkAuth } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const isInitializingRef = useRef(true);
  
  useEffect(() => {
    isInitializingRef.current = isInitializing;
  }, [isInitializing]);
  
  useEffect(() => {
    let isMounted = true;
    
    // Timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (isMounted && isInitializingRef.current) {
        console.warn('Auth check timed out, proceeding without auth');
        setIsInitializing(false);
      }
    }, AUTH_TIMEOUT);
    
    async function initialize() {
      try {
        await checkAuth();
      } catch (error) {
        console.warn('Auth check failed:', error);
        // Don't block app loading on auth failure
        if (isMounted) {
          setInitError('Failed to restore session');
        }
      } finally {
        clearTimeout(timeout);
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    }
    
    initialize();
    
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [checkAuth]);
  
  // Show loading screen during initialization
  if (isInitializing) {
    return <LoadingScreen message="Loading VERGO..." />;
  }
  
  // Show main app (error is handled gracefully - user can still use app)
  return (
    <>
      {initError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{initError}</Text>
        </View>
      )}
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
          translucent={false}
        />
        <View style={styles.container}>
          <AppContent />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorBanner: {
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  errorText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
  },
});
