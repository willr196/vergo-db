/**
 * App Navigation
 * Root navigator with auth flow and tab navigators
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { colors, typography } from '../theme';
import { useAuthStore } from '../store';
import type { RootStackParamList, JobSeekerTabParamList, ClientTabParamList } from '../types';

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

// Placeholder screens for client (to be built)
const ClientDashboard = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>Client Dashboard</Text>
    <Text style={styles.placeholderSubtext}>Coming soon...</Text>
  </View>
);

const ClientMyJobs = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>My Jobs</Text>
    <Text style={styles.placeholderSubtext}>Coming soon...</Text>
  </View>
);

const ClientProfile = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderText}>Company Profile</Text>
    <Text style={styles.placeholderSubtext}>Coming soon...</Text>
  </View>
);

// Navigation theme
const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
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
        options={{ tabBarLabel: 'Applications' }}
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
        component={ClientDashboard}
        options={{ tabBarLabel: 'Dashboard' }}
      />
      <ClientTab.Screen 
        name="MyJobs" 
        component={ClientMyJobs}
        options={{ tabBarLabel: 'My Jobs' }}
      />
      <ClientTab.Screen 
        name="CompanyProfile" 
        component={ClientProfile}
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
    </Stack.Navigator>
  );
}

// Root Navigator
export function RootNavigator() {
  const { isAuthenticated, userType } = useAuthStore();
  
  return (
    <NavigationContainer theme={navigationTheme}>
      {!isAuthenticated ? (
        <AuthStack />
      ) : userType === 'jobseeker' ? (
        <JobSeekerStack />
      ) : (
        <ClientStack />
      )}
    </NavigationContainer>
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
    fontWeight: typography.fontWeight.medium,
    marginTop: 4,
  },
  
  tabIcon: {
    fontSize: 22,
  },
  
  tabIconFocused: {
    transform: [{ scale: 1.1 }],
  },
  
  placeholder: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  placeholderText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 8,
  },
  
  placeholderSubtext: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
});

export default RootNavigator;
