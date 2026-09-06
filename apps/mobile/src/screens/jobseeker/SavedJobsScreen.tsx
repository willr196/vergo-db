/**
 * Saved Jobs Screen
 * Lists a jobseeker's saved postings, including ones that are no longer available.
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, ErrorState } from '../../components';
import { JobCard } from '../../components/JobCard';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { useJobsStore } from '../../store';
import type { Job, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedJobs'>;

function isUnavailable(job: Job): boolean {
  if (job.status !== 'published') return true;

  const eventDate = new Date(job.date);
  if (Number.isNaN(eventDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
}

export function SavedJobsScreen({ navigation }: Props) {
  const { savedJobs, fetchSavedJobs, unsaveJob } = useJobsStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      await fetchSavedJobs();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load saved jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchSavedJobs]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const removeSavedJob = useCallback(async (jobId: string) => {
    setRemovingId(jobId);
    try {
      await unsaveJob(jobId);
    } finally {
      setRemovingId(null);
    }
  }, [unsaveJob]);

  const renderJob = useCallback(({ item }: { item: Job }) => {
    const unavailable = isUnavailable(item);
    const unavailableMessage = item.status !== 'published'
      ? 'This posting is no longer accepting applications.'
      : 'This shift date has passed.';

    return (
      <View style={unavailable ? styles.unavailableCard : undefined}>
        <JobCard
          job={item}
          onPress={() => {
            if (!unavailable) navigation.navigate('JobDetail', { jobId: item.id });
          }}
        />
        {unavailable ? (
          <View style={styles.unavailableNotice}>
            <Text style={styles.unavailableText}>{unavailableMessage}</Text>
            <TouchableOpacity
              onPress={() => removeSavedJob(item.id)}
              disabled={removingId === item.id}
            >
              <Text style={styles.removeText}>
                {removingId === item.id ? 'Removing…' : 'Remove'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }, [navigation, removeSavedJob, removingId]);

  if (loading && savedJobs.length === 0) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;
  }

  if (error && savedJobs.length === 0) {
    return <SafeAreaView style={styles.container}><ErrorState message={error} onRetry={() => load()} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Saved jobs</Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={savedJobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderJob}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="♡"
            title="No saved jobs"
            message="Save a job to return to it later."
            actionTitle="Browse Jobs"
            onAction={() => navigation.goBack()}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  back: { color: colors.primary, fontSize: typography.fontSize.md, fontWeight: '600' as const },
  title: { color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' as const },
  headerSpacer: { width: 48 },
  list: { padding: spacing.lg, flexGrow: 1 },
  unavailableCard: { opacity: 0.7 },
  unavailableNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.md, padding: spacing.sm, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md },
  unavailableText: { flex: 1, color: colors.textSecondary, fontSize: typography.fontSize.xs },
  removeText: { color: colors.primary, fontSize: typography.fontSize.sm, fontWeight: '600' as const },
});

export default SavedJobsScreen;
