/**
 * Biometric Authentication Utilities
 * Wraps expo-local-authentication for use in auth flow.
 */

import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../api/client';
import { logger } from './logger';

type LocalAuthenticationModule = typeof import('expo-local-authentication');

function loadLocalAuthentication(): LocalAuthenticationModule | null {
  try {
    return require('expo-local-authentication') as LocalAuthenticationModule;
  } catch (error) {
    logger.warn('expo-local-authentication is unavailable in this client:', error);
    return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const LocalAuthentication = loadLocalAuthentication();
  if (!LocalAuthentication) return false;

  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    logger.warn('Biometric availability check failed:', error);
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
  return val === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
}

export async function hasBiometricBeenAsked(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ASKED);
  return val === 'true';
}

export async function markBiometricAsked(): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ASKED, 'true');
}

/**
 * Prompt the user for biometric authentication.
 * Returns true if the authentication succeeded.
 */
export async function authenticateWithBiometrics(promptMessage?: string): Promise<boolean> {
  const LocalAuthentication = loadLocalAuthentication();
  if (!LocalAuthentication) return false;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || 'Sign in to VERGO',
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (error) {
    logger.warn('Biometric authentication failed:', error);
    return false;
  }
}
