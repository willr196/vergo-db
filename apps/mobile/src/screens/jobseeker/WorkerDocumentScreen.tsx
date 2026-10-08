import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { documentsApi } from '../../api';
import { Button, ErrorState, LoadingScreen } from '../../components';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { formatDate } from '../../utils';
import type { RootStackParamList, WorkerDocumentDetail, WorkerDocumentType, WorkerDocumentsSummary } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkerDocument'>;

const SHORT_TITLES: Record<WorkerDocumentType, string> = {
  KEY_INFORMATION_DOCUMENT: 'Key information',
  ZERO_HOURS_AGREEMENT: 'Your agreement',
  ASSIGNMENT_CONFIRMATION: 'Assignment',
};

// One document, in full. A Key Information Document not yet confirmed, or an
// agreement waiting to be agreed, has its step under the text: tick the
// statement (and, for the agreement, type your name), then confirm. The
// statements are the server's own wording, the same as on the secure link.
export function WorkerDocumentScreen({ navigation, route }: Props) {
  const { documentId } = route.params;
  const [doc, setDoc] = useState<WorkerDocumentDetail | null>(null);
  const [summary, setSummary] = useState<WorkerDocumentsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, s] = await Promise.all([documentsApi.getDocument(documentId), documentsApi.getSummary()]);
      setDoc(d);
      setSummary(s);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load this document');
    }
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  if (error && !doc) return <SafeAreaView style={styles.container}><Header onBack={() => navigation.goBack()} title="Document" /><ErrorState message={error} onRetry={load} /></SafeAreaView>;
  if (!doc || !summary) return <LoadingScreen message="Loading document..." />;

  const isKid = doc.type === 'KEY_INFORMATION_DOCUMENT';
  const isAgreement = doc.type === 'ZERO_HOURS_AGREEMENT';
  const kidDone = Boolean(summary.kid?.acknowledgedAt);
  const needsAck = isKid && doc.status === 'ISSUED' && !doc.acknowledgedAt;
  const needsAgree = isAgreement && doc.status === 'ISSUED';
  const statement = isKid ? summary.statements.kidAcknowledgement : summary.statements.agreement;

  const submit = async () => {
    if (!ticked) { Alert.alert('Tick the box first', isKid ? 'Tick the box to confirm you have received it.' : 'Tick the box to confirm you have read and agree to the agreement.'); return; }
    if (needsAgree && typedName.trim().length < 2) { Alert.alert('Type your full name', 'Typing your name records your agreement to this version.'); return; }
    setSaving(true);
    try {
      if (needsAck) await documentsApi.acknowledgeKid(doc.id);
      else await documentsApi.acceptAgreement(doc.id, typedName.trim());
      Alert.alert(needsAck ? 'Thank you' : 'Agreement recorded', needsAck ? 'You can now read and agree your employment agreement.' : 'Your agreement to this version has been recorded with the date and time.');
      navigation.goBack();
    } catch (submitError) {
      Alert.alert('Could not save', submitError instanceof Error ? submitError.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  let stateLine: string | null = null;
  if (doc.status === 'SUPERSEDED') stateLine = 'This version has been replaced. It is kept for your records.';
  else if (isKid && doc.acknowledgedAt) stateLine = `You confirmed you received this on ${formatDate(doc.acknowledgedAt)}.`;
  else if (isAgreement && doc.acceptedAt) stateLine = `You agreed this version on ${formatDate(doc.acceptedAt)} as “${doc.acceptedName ?? ''}”.`;

  return (
    <SafeAreaView style={styles.container}>
      <Header onBack={() => navigation.goBack()} title={SHORT_TITLES[doc.type]} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.meta}>Version {doc.version}, issued {formatDate(doc.issuedAt)}</Text>
          {stateLine && <View style={[styles.stateCard, doc.status === 'SUPERSEDED' && styles.stateCardOld]}><Text style={styles.stateText}>{stateLine}</Text></View>}
          <View style={styles.paper}><DocumentText text={doc.body} /></View>

          {(needsAck || needsAgree) && (
            isAgreement && !kidDone ? (
              <View style={styles.actionCard}><Text style={styles.locked}>Please read and confirm your Key Information Document first. The agreement can be agreed once you have.</Text></View>
            ) : (
              <View style={styles.actionCard}>
                <TouchableOpacity style={styles.checkRow} onPress={() => setTicked((t) => !t)} accessibilityRole="checkbox" accessibilityState={{ checked: ticked }}>
                  <View style={[styles.checkbox, ticked && styles.checkboxOn]}>{ticked && <Text style={styles.checkMark}>✓</Text>}</View>
                  <Text style={styles.checkText}>{statement}</Text>
                </TouchableOpacity>
                {needsAgree && (
                  <>
                    <Text style={styles.label}>Your full name</Text>
                    <TextInput style={styles.input} value={typedName} onChangeText={setTypedName} placeholder="Type your full name" placeholderTextColor={colors.textMuted} autoComplete="name" textContentType="name" autoCapitalize="words" maxLength={200} />
                    <Text style={styles.small}>This is an electronic agreement. Typing your name and pressing Agree records your agreement to this exact version, with the date and time.</Text>
                  </>
                )}
                <Button title={saving ? 'Saving…' : needsAck ? 'Confirm I have received it' : 'Agree'} onPress={submit} fullWidth disabled={saving} />
              </View>
            )
          )}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return <View style={styles.header}><TouchableOpacity onPress={onBack}><Text style={styles.back}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle} numberOfLines={1}>{title}</Text><View style={styles.headerSpacer} /></View>;
}

/** The document's plain text: "# " and "## " headings, "- " list items, paragraphs split by blank lines. */
export function DocumentText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) { blocks.push(<Text key={blocks.length} style={styles.docPara}>{para.join('\n')}</Text>); para = []; }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) { flush(); blocks.push(<Text key={blocks.length} style={styles.docH2}>{line.slice(3)}</Text>); }
    else if (line.startsWith('# ')) { flush(); blocks.push(<Text key={blocks.length} style={styles.docH1}>{line.slice(2)}</Text>); }
    else if (line.startsWith('- ')) { flush(); blocks.push(<View key={blocks.length} style={styles.docLi}><Text style={styles.docBullet}>•</Text><Text style={styles.docLiText}>{line.slice(2)}</Text></View>); }
    else if (line.trim() === '') flush();
    else para.push(line);
  }
  flush();
  return <>{blocks}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  back: { color: colors.primaryDark, fontSize: typography.fontSize.md, fontWeight: '600' as const },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' as const, marginHorizontal: spacing.sm },
  headerSpacer: { width: 50 },
  content: { padding: spacing.lg },
  meta: { color: colors.textMuted, fontSize: typography.fontSize.sm, marginBottom: spacing.md },
  stateCard: { backgroundColor: colors.successSoft, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  stateCardOld: { backgroundColor: colors.warningSoft },
  stateText: { color: colors.textPrimary, fontSize: typography.fontSize.sm, lineHeight: 20 },
  paper: { backgroundColor: colors.backgroundRaised, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.md, padding: spacing.md },
  docH1: { color: colors.textPrimary, fontFamily: typography.fontFamily.display, fontSize: typography.fontSize.xl, fontWeight: '700' as const, marginBottom: spacing.sm },
  docH2: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '700' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  docPara: { color: colors.textPrimary, fontSize: typography.fontSize.sm, lineHeight: 21, marginBottom: spacing.sm },
  docLi: { flexDirection: 'row', marginBottom: spacing.xs, paddingRight: spacing.sm },
  docBullet: { color: colors.textSecondary, width: 16, fontSize: typography.fontSize.sm, lineHeight: 21 },
  docLiText: { flex: 1, color: colors.textPrimary, fontSize: typography.fontSize.sm, lineHeight: 21 },
  actionCard: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.primaryLine, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.lg },
  locked: { color: colors.textSecondary, fontSize: typography.fontSize.sm, lineHeight: 20, fontStyle: 'italic' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.surfaceBorderStrong, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginTop: 1 },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.textInverse, fontWeight: '700' as const },
  checkText: { flex: 1, color: colors.textPrimary, fontSize: typography.fontSize.md, lineHeight: 22 },
  label: { color: colors.textSecondary, fontSize: typography.fontSize.sm, marginBottom: spacing.xs },
  input: { padding: spacing.md, color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorderStrong, borderRadius: borderRadius.md, fontSize: typography.fontSize.md },
  small: { color: colors.textMuted, fontSize: typography.fontSize.xs, lineHeight: 17, marginTop: spacing.sm, marginBottom: spacing.md },
});

export default WorkerDocumentScreen;
