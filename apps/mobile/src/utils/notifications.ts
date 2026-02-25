/**
 * Push Notification Utility
 * Handles Expo push notification setup, permission requests,
 * token registration, and notification listeners.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authApi } from '../api';
import { logger } from './logger';

// Configure how notifications are displayed when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and register the device push token.
 * Safe to call multiple times — skips silently if already registered
 * or if running on a simulator.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) {
    logger.warn('Push notifications are only supported on physical devices.');
    return;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    logger.warn('Push notification permission not granted.');
    return;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4AF37',
    });
  }

  // Get the Expo push token
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  let expoPushToken: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    expoPushToken = tokenData.data;
  } catch (err) {
    logger.error('Failed to get Expo push token:', err);
    return;
  }

  // Register token with backend
  try {
    await authApi.registerPushToken(expoPushToken);
    logger.info('Push token registered:', expoPushToken);
  } catch (err) {
    // Non-fatal — app still works without push notifications
    logger.warn('Failed to register push token with backend:', err);
  }
}

/**
 * Add a listener that fires when a notification is received
 * while the app is in the foreground.
 * Returns a cleanup function — call it in useEffect cleanup.
 */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
): () => void {
  const sub = Notifications.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Add a listener that fires when the user taps a notification.
 * Returns a cleanup function — call it in useEffect cleanup.
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}
