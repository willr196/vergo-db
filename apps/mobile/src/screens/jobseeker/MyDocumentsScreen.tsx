import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { documentsApi } from '../../api';
import { ErrorState, LoadingScreen } from '../../components';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { formatDate } from '../../utils';
import type { RootStackParamList, WorkerDocumentsSummary } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyDocuments'>;

// The worker's employment documents from VERGO Ops: confirm the Key
// Information Document, then agree the employment agreement. Each opens on
// its own screen with the full text, and the confirm / agree step sits under
// the text so it is read first.
export function MyDocumentsScreen({ navigation }: Props) {
  const [summary, setSummary] = useState<WorkerDocumentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try { setSummary(await documentsApi.getSummary()); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Failed to load your documents'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Coming back from agreeing a document shows the new state.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !summary) return <LoadingScreen message="Loading your documents..." />;
  if (error && !summary) return <SafeAreaView style={styles.container}><Header onBack={() => navigation.goBack()} /><ErrorState message={error} onRetry={() => load()} /></SafeAreaView>;
  if (!summary) return null;

  const { kid, agreement, confirmations } = summary;
  const kidDone = Boolean(kid?.acknowledgedAt);
  const agreementDone = Boolean(agreement?.acceptedAt);
  const open = (documentId: string) => navigation.navigate('WorkerDocument', { documentId });

  return (
    <SafeAreaView style={styles.container}>
      <Header onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
        <Text style={styles.lede}>
          {summary.toDo > 0
            ? 'Please read your Key Information Document and confirm you have it, then read and agree your employment agreement.'
            : kid || agreement ? 'You are up to date. Your documents are here whenever you need them.' : 'VERGO has not sent you any documents yet. They will appear here when we do.'}
        </Text>

        <DocCard
          step="1"
          title="Key Information Document"
          meta={kid ? `Version ${kid.version}, issued ${formatDate(kid.issuedAt)}` : null}
          state={!kid ? 'waiting' : kidDone ? 'done' : 'todo'}
          stateText={!kid ? 'Not issued yet' : kidDone ? `Confirmed ${formatDate(kid.acknowledgedAt!)}` : 'Read and confirm'}
          onPress={kid ? () => open(kid.id) : undefined}
        />
        <DocCard
          step="2"
          title="Employment agreement"
          meta={agreement ? `Version ${agreement.version}, issued ${formatDate(agreement.issuedAt)}${agreement.replacesVersion ? `. Replaces version ${agreement.replacesVersion} once agreed.` : ''}` : null}
          state={!agreement ? 'waiting' : agreementDone ? 'done' : kidDone ? 'todo' : 'locked'}
          stateText={!agreement ? 'Not issued yet' : agreementDone ? `Agreed ${formatDate(agreement.acceptedAt!)}` : kidDone ? 'Read and agree' : 'Opens after step 1'}
          onPress={agreement ? () => open(agreement.id) : undefined}
        />

        {confirmations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assignment confirmations</Text>
            {confirmations.map((c) => (
              <TouchableOpacity key={c.id} style={styles.confirmationRow} onPress={() => open(c.id)} accessibilityRole="button">
                <Text style={styles.confirmationText}>
                  {[c.date ? formatDate(c.date) : formatDate(c.issuedAt), c.start, c.role, c.venue].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return <View style={styles.header}><TouchableOpacity onPress={onBack}><Text style={styles.back}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>My documents</Text><View style={styles.headerSpacer} /></View>;
}

type CardState = 'todo' | 'done' | 'locked' | 'waiting';

function DocCard({ step, title, meta, state, stateText, onPress }: { step: string; title: string; meta: string | null; state: CardState; stateText: string; onPress?: () => void }) {
  const body = (
    <View style={[styles.card, state === 'todo' && styles.cardTodo]}>
      <View style={[styles.stepDot, state === 'done' && styles.stepDotDone]}><Text style={[styles.stepText, state === 'done' && styles.stepTextDone]}>{state === 'done' ? '✓' : step}</Text></View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>{title}</Text>
        {meta && <Text style={styles.cardMeta}>{meta}</Text>}
        <Text style={[styles.cardState, state === 'todo' && styles.cardStateTodo, state === 'done' && styles.cardStateDone]}>{stateText}</Text>
      </View>
      {onPress && <Text style={styles.chevron}>›</Text>}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${stateText}`}>{body}</TouchableOpacity> : body;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  back: { color: colors.primaryDark, fontSize: typography.fontSize.md, fontWeight: '600' as const },
  headerTitle: { color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' as const },
  headerSpacer: { width: 50 },
  content: { padding: spacing.lg },
  lede: { color: colors.textSecondary, fontSize: typography.fontSize.md, lineHeight: 23, marginBottom: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  cardTodo: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  stepDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.surfaceBorderStrong, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepText: { color: colors.textSecondary, fontWeight: '700' as const },
  stepTextDone: { color: colors.textInverse },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '700' as const },
  cardMeta: { color: colors.textMuted, fontSize: typography.fontSize.xs, marginTop: 2 },
  cardState: { color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  cardStateTodo: { color: colors.primaryDark, fontWeight: '700' as const },
  cardStateDone: { color: colors.success },
  chevron: { color: colors.textMuted, fontSize: typography.fontSize.xl, marginLeft: spacing.sm },
  section: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.sm },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '700' as const, marginBottom: spacing.sm },
  confirmationRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceBorder },
  confirmationText: { flex: 1, color: colors.textPrimary, fontSize: typography.fontSize.sm },
});

export default MyDocumentsScreen;
