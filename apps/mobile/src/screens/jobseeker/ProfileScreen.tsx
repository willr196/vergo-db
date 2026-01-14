/**
 * Profile Screen
 * Job seeker profile management
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button } from '../../components';
import { useAuthStore, selectJobSeeker } from '../../store';
import type { RootStackParamList, JobSeekerTabParamList, AvailabilityStatus } from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<JobSeekerTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

const AVAILABILITY_CONFIG: Record<AvailabilityStatus, { label: string; color: string }> = {
  available: { label: 'Available', color: colors.success },
  limited: { label: 'Limited Availability', color: colors.warning },
  unavailable: { label: 'Not Available', color: colors.error },
};

export function ProfileScreen({ navigation }: Props) {
  const { logout, isLoading } = useAuthStore();
  const user = useAuthStore(selectJobSeeker);
  
  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };
  
  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };
  
  if (!user) {
    return null;
  }
  
  const availabilityConfig = AVAILABILITY_CONFIG[user.availability || 'available'];
  const completionPercentage = calculateProfileCompletion(user);
  
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.firstName.charAt(0)}{user.lastName.charAt(0)}
              </Text>
            </View>
            <View style={[
              styles.availabilityDot,
              { backgroundColor: availabilityConfig.color }
            ]} />
          </View>
          
          <Text style={styles.userName}>
            {user.firstName} {user.lastName}
          </Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          
          <View style={styles.availabilityBadge}>
            <View style={[
              styles.availabilityIndicator,
              { backgroundColor: availabilityConfig.color }
            ]} />
            <Text style={styles.availabilityText}>
              {availabilityConfig.label}
            </Text>
          </View>
          
          <Button
            title="Edit Profile"
            onPress={handleEditProfile}
            variant="outline"
            size="sm"
            style={styles.editButton}
          />
        </View>
        
        {/* Profile Completion */}
        {completionPercentage < 100 && (
          <View style={styles.completionCard}>
            <View style={styles.completionHeader}>
              <Text style={styles.completionTitle}>Complete Your Profile</Text>
              <Text style={styles.completionPercent}>{completionPercentage}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill,
                  { width: `${completionPercentage}%` }
                ]} 
              />
            </View>
            <Text style={styles.completionHint}>
              Complete profiles get 3x more responses from employers
            </Text>
          </View>
        )}
        
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.completedJobs || 0}</Text>
            <Text style={styles.statLabel}>Jobs Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.yearsExperience || 0}</Text>
            <Text style={styles.statLabel}>Years Exp.</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {user.rating ? user.rating.toFixed(1) : '—'}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
        
        {/* Sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Status</Text>
          
          <View style={styles.verificationList}>
            <View style={styles.verificationItem}>
              <Text style={styles.verificationIcon}>
                {user.rightToWork ? '✓' : '○'}
              </Text>
              <View style={styles.verificationContent}>
                <Text style={styles.verificationLabel}>Right to Work</Text>
                <Text style={styles.verificationStatus}>
                  {user.rightToWork ? 'Verified' : 'Not verified'}
                </Text>
              </View>
            </View>
            
            <View style={styles.verificationItem}>
              <Text style={styles.verificationIcon}>
                {user.hasDBSCheck ? '✓' : '○'}
              </Text>
              <View style={styles.verificationContent}>
                <Text style={styles.verificationLabel}>DBS Check</Text>
                <Text style={styles.verificationStatus}>
                  {user.hasDBSCheck 
                    ? `Verified${user.dbsCheckDate ? ` (${formatDate(user.dbsCheckDate)})` : ''}`
                    : 'Not provided'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        
        {/* Skills */}
        {user.skills && user.skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsContainer}>
              {user.skills.map((skill, index) => (
                <View key={index} style={styles.skillChip}>
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        
        {/* Preferred Roles */}
        {user.preferredRoles && user.preferredRoles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferred Roles</Text>
            <View style={styles.skillsContainer}>
              {user.preferredRoles.map((role, index) => (
                <View key={index} style={styles.roleChip}>
                  <Text style={styles.roleText}>{formatRole(role)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        
        {/* Menu Items - TODO: Implement these screens before uncommenting
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>📄</Text>
            <Text style={styles.menuLabel}>Documents</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔔</Text>
            <Text style={styles.menuLabel}>Notifications</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔒</Text>
            <Text style={styles.menuLabel}>Privacy & Security</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuIcon}>❓</Text>
            <Text style={styles.menuLabel}>Help & Support</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        </View>
        */}
        
        {/* Logout */}
        <Button
          title="Sign Out"
          onPress={handleLogout}
          variant="ghost"
          loading={isLoading}
          style={styles.logoutButton}
          textStyle={styles.logoutText}
        />
        
        <Text style={styles.version}>VERGO v1.0.0</Text>
        
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper functions
function calculateProfileCompletion(user: any): number {
  const fields = [
    user.firstName,
    user.lastName,
    user.email,
    user.phone,
    user.bio,
    user.city,
    user.preferredRoles?.length > 0,
    user.skills?.length > 0,
    user.yearsExperience > 0,
    user.rightToWork,
  ];
  
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  });
}

function formatRole(role: string): string {
  return role
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  content: {
    flex: 1,
  },
  
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  
  profileCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  avatarText: {
    color: colors.textInverse,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  
  availabilityDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  
  userName: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
    marginBottom: spacing.xs,
  },
  
  userEmail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  
  availabilityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  
  availabilityText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  editButton: {
    minWidth: 120,
  },
  
  completionCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  
  completionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '500' as const,
  },
  
  completionPercent: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '700' as const,
  },
  
  progressBar: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    marginBottom: spacing.sm,
  },
  
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  
  completionHint: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
  },
  
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  
  statValue: {
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: '700' as const,
  },
  
  statLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  
  verificationList: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  
  verificationIcon: {
    fontSize: 18,
    color: colors.success,
    marginRight: spacing.md,
  },
  
  verificationContent: {
    flex: 1,
  },
  
  verificationLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  
  verificationStatus: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  
  skillChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  
  skillText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  roleChip: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  
  roleText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
  },
  
  menuSection: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  
  menuIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  
  menuLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
  },
  
  menuArrow: {
    color: colors.textMuted,
    fontSize: typography.fontSize.md,
  },
  
  logoutButton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  
  logoutText: {
    color: colors.error,
  },
  
  version: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },
});

export default ProfileScreen;
