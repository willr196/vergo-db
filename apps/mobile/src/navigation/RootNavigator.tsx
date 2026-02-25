/**
 * App Navigation
 * Root navigator with auth flow and tab navigators
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';

import { colors, typography } from '../theme';
import { useAuthStore, useNotificationsStore, useJobsStore, useApplicationsStore, registerRefreshCallback } from '../store';
import { Toast } from '../components';
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '../utils/notifications';
import { navigationRef } from './navigationRef';
import type { RootStackParamList, JobSeekerTabParamList, ClientTabParamList, UserType } from '../types';

// Auth Screens
import { 
  WelcomeScreen, 
  LoginScreen, 
  RegisterScreen, 
  ForgotPasswordScreen 
} from '../screens/auth';

// Job Seeker Screens
import {
  JobsScreen,
  JobDetailScreen,
  ApplicationsScreen,
  ApplicationDetailScreen,
  ProfileScreen,
  EditProfileScreen,
  ApplyToJobScreen,
} from '../screens/jobseeker';

// Client Screens
import {
  DashboardScreen,
  MyJobsScreen,
  CompanyProfileScreen,
  CreateJobScreen,
  ClientJobDetailScreen,
  ApplicantListScreen,
  ApplicantDetailScreen,
  EditJobScreen,
  EditClientProfileScreen,
} from '../screens/client';

// Navigation theme
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.surfaceBorder,
    notification: colors.primary,
  },
};

// Stack navigators
const Stack = createNativeStackNavigator<RootStackParamList>();
const JobSeekerTab = createBottomTabNavigator<JobSeekerTabParamList>();
const ClientTab = createBottomTabNavigator<ClientTabParamList>();

// Route to the correct screen based on notification data
function readStringDataField(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function handleNotificationTap(
  notification: Notifications.Notification,
  userType: UserType | null
) {
  if (!navigationRef.isReady()) return;
  const data = notification.request.content.data;
  const type = readStringDataField(data, 'type');

  if (type === 'application_update' && userType === 'jobseeker') {
    const applicationId = readStringDataField(data, 'applicationId');
    if (applicationId) {
      navigationRef.navigate('ApplicationDetail', { applicationId });
    }
  } else if (type === 'new_applicant' && userType === 'client') {
    const jobId = readStringDataField(data, 'jobId');
    if (jobId) {
      navigationRef.navigate('ClientJobDetail', { jobId, initialTab: 'applications' });
    }
  } else if (type === 'new_job' && userType === 'jobseeker') {
    const jobId = readStringDataField(data, 'jobId');
    if (jobId) {
      navigationRef.navigate('JobDetail', { jobId });
    }
  }
}

// Tab bar icon component
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Jobs: '💼',
    Applications: '📋',
    Profile: '👤',
    Dashboard: '📊',
    MyJobs: '📝',
    CompanyProfile: '🏢',
  };

  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {icons[label] || '•'}
    </Text>
  );
}

// Job Seeker Tab Navigator
function JobSeekerTabNavigator() {
  const { unreadCount, clearUnread } = useNotificationsStore();
  return (
    <JobSeekerTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <JobSeekerTab.Screen
        name="Jobs"
        component={JobsScreen}
        options={{ tabBarLabel: 'Jobs' }}
      />
      <JobSeekerTab.Screen
        name="Applications"
        component={ApplicationsScreen}
        options={{ tabBarLabel: 'Applications', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
        listeners={{ tabPress: () => clearUnread() }}
      />
      <JobSeekerTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </JobSeekerTab.Navigator>
  );
}

// Client Tab Navigator
function ClientTabNavigator() {
  const { unreadCount, clearUnread } = useNotificationsStore();
  return (
    <ClientTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <ClientTab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Dashboard', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
        listeners={{ tabPress: () => clearUnread() }}
      />
      <ClientTab.Screen
        name="MyJobs"
        component={MyJobsScreen}
        options={{ tabBarLabel: 'My Jobs' }}
      />
      <ClientTab.Screen
        name="CompanyProfile"
        component={CompanyProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </ClientTab.Navigator>
  );
}

// Auth Stack
function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// Job Seeker Stack
function JobSeekerStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="JobSeekerTabs" component={JobSeekerTabNavigator} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} />
      <Stack.Screen
        name="ApplyToJob"
        component={ApplyToJobScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="ApplicationDetail" component={ApplicationDetailScreen} />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

// Client Stack
function ClientStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ClientTabs" component={ClientTabNavigator} />
      <Stack.Screen name="ClientJobDetail" component={ClientJobDetailScreen} />
      <Stack.Screen name="ApplicantList" component={ApplicantListScreen} />
      <Stack.Screen name="ApplicantDetail" component={ApplicantDetailScreen} />
      <Stack.Screen
        name="CreateJob"
        component={CreateJobScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="EditJob"
        component={EditJobScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="EditClientProfile"
        component={EditClientProfileScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

// Root Navigator
export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userType = useAuthStore((s) => s.userType);
  const { incrementUnread } = useNotificationsStore();
  const { fetchJobs } = useJobsStore();
  const { fetchApplications } = useApplicationsStore();

  const linking = useMemo<LinkingOptions<RootStackParamList>>(() => ({
    prefixes: ['vergo://', 'https://vergo-app.fly.dev/app'],
    config: {
      screens: {
        Welcome: 'welcome',
        Login: 'login',
        Register: 'register',
        ForgotPassword: 'forgot-password',
        JobSeekerTabs: {
          screens: {
            Jobs: 'jobs',
            Applications: 'applications',
            Profile: 'profile',
          },
        },
        JobDetail: 'job/:jobId',
        ApplyToJob: 'job/:jobId/apply',
        ApplicationDetail: 'application/:applicationId',
        EditProfile: 'profile/edit',
        ClientTabs: {
          screens: {
            Dashboard: 'client/dashboard',
            MyJobs: 'client/jobs',
            CompanyProfile: 'client/profile',
          },
        },
        ClientJobDetail: 'client/job/:jobId',
        CreateJob: 'client/jobs/create',
        EditJob: 'client/jobs/:jobId/edit',
        ApplicantDetail: 'client/application/:applicationId',
        ApplicantList: 'client/job/:jobId/applicants',
        EditClientProfile: 'client/profile/edit',
      },
    },
  }), []);

  // Register push token after login; clean up listeners on logout
  const notifListenerRef = useRef<(() => void) | null>(null);
  const responseListenerRef = useRef<(() => void) | null>(null);
  const userTypeRef = useRef(userType);
  userTypeRef.current = userType;

  // Register refresh callbacks so data reloads automatically when coming back online
  useEffect(() => {
    const unregisterJobs = registerRefreshCallback(() => fetchJobs(true));
    const unregisterApps = registerRefreshCallback(() => fetchApplications(true));
    return () => {
      unregisterJobs();
      unregisterApps();
    };
  }, [fetchJobs, fetchApplications]);

  useEffect(() => {
    if (!isAuthenticated) {
      notifListenerRef.current?.();
      responseListenerRef.current?.();
      notifListenerRef.current = null;
      responseListenerRef.current = null;
      return;
    }

    // Register push token (fire-and-forget — non-blocking)
    registerForPushNotifications();

    // Foreground notification received — increment badge
    notifListenerRef.current = addNotificationReceivedListener((_notification) => {
      incrementUnread();
    });

    // Tap listener — navigate to the relevant screen
    responseListenerRef.current = addNotificationResponseListener((response) => {
      handleNotificationTap(response.notification, userTypeRef.current);
    });

    // Handle the case where the app was launched from a killed state via a notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationTap(response.notification, userTypeRef.current);
      }
    });

    return () => {
      notifListenerRef.current?.();
      responseListenerRef.current?.();
    };
  }, [isAuthenticated, incrementUnread]);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} theme={navigationTheme} linking={linking}>
        {!isAuthenticated ? (
          <AuthStack />
        ) : userType === 'jobseeker' ? (
          <JobSeekerStack />
        ) : (
          <ClientStack />
        )}
      </NavigationContainer>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.surfaceBorder,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    height: 60,
  },
  
  tabLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500' as const,
    marginTop: 4,
  },
  
  tabIcon: {
    fontSize: 22,
  },
  
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
});

export default RootNavigator;
