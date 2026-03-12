/**
 * Staff Detail Screen
 * Full profile with booking CTA
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Button, ErrorState, LoadingScreen } from '../../components';
import { marketplaceApi } from '../../api';
import type { MarketplaceStaff, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'StaffDetail'>;

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export function StaffDetailScreen({ navigation, route }: Props) {
  const [staff, setStaff] = useState<MarketplaceStaff | null>(route.params.staff ?? null);
  const [isLoading, setIsLoading] = useState(!route.params.staff);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = useCallback(async (refreshing = false) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else if (!route.params.staff) {
      setIsLoading(true);
    }

    try {
      setError(null);
      const fetched = await marketplaceApi.getStaffProfile(route.params.staffId);
      setStaff((current) => ({
        ...(current ?? fetched),
        ...fetched,
        hourlyRate: fetched.hourlyRate ?? current?.hourlyRate ?? null,
        isBookable: fetched.isBookable ?? current?.isBookable ?? false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load staff profile';
      setError(message);
    } finally {
      if (refreshing) setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [route.params.staff, route.params.staffId]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  if (isLoading && !staff) {
    return <LoadingScreen message="Loading staff profile..." />;
  }

  if (error && !staff) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message={error} onRetry={() => fetchStaff()} />
      </SafeAreaView>
    );
  }

  if (!staff) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState message="Staff member not found" onRetry={() => fetchStaff()} />
      </SafeAreaView>
    );
  }

  const isElite = staff.tier === 'ELITE';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchStaff(true)}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.profileHeader}>
          <View style={[styles.avatar, isElite && styles.avatarElite]}>
            <Text style={styles.avatarText}>{getInitials(staff.name)}</Text>
          </View>
          <Text style={styles.name}>{staff.name}</Text>
          <View style={[styles.tierBadge, isElite ? styles.tierBadgeElite : styles.tierBadgeStandard]}>
            <Text style={[styles.tierBadgeText, isElite ? styles.tierBadgeTextElite : styles.tierBadgeTextStandard]}>
              {isElite ? 'ELITE' : 'STANDARD'}
            </Text>
          </View>
          <Text style={styles.rating}>
            {staff.rating ? `⭐ ${staff.rating.toFixed(1)} (${staff.reviewCount} reviews)` : 'No reviews yet'}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Highlights</Text>
          <Text style={staff.highlights ? styles.sectionText : styles.sectionTextMuted}>
            {staff.highlights || 'No highlights provided yet.'}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Bio</Text>
          <Text style={staff.bio ? styles.sectionText : styles.sectionTextMuted}>
            {staff.bio || 'No bio provided yet.'}
          </Text>
        </View>

        <View style={styles.rateCard}>
          <Text style={styles.rateLabel}>Hourly Rate</Text>
          <Text style={styles.rateValue}>
            {staff.hourlyRate != null ? `£${staff.hourlyRate}/hr` : 'Unavailable'}
          </Text>
        </View>

        {staff.isBookable ? (
          <Button
            title={`Book ${staff.name.split(' ')[0]}`}
            onPress={() => navigation.navigate('CreateBooking', { staffId: staff.id, staff })}
            fullWidth
            style={styles.ctaButton}
          />
        ) : (
          <Button
            title="Upgrade to Premium to Book"
            variant="outline"
            onPress={() => Alert.alert('Upgrade Required', 'Upgrade to Premium to book this staff tier.')}
            fullWidth
            style={styles.ctaButton}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarElite: {
    borderColor: colors.primary,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  tierBadge: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tierBadgeElite: {
    borderColor: 'rgba(212, 175, 55, 0.40)',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  tierBadgeStandard: {
    borderColor: colors.surfaceBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  tierBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700' as const,
  },
  tierBadgeTextElite: {
    color: colors.primary,
  },
  tierBadgeTextStandard: {
    color: colors.textSecondary,
  },
  rating: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  sectionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  sectionTextMuted: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    fontStyle: 'italic',
  },
  rateCard: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.40)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  rateLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  rateValue: {
    color: colors.primary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700' as const,
    marginTop: spacing.xs,
  },
  ctaButton: {
    marginTop: spacing.sm,
  },
});

export default StaffDetailScreen;
