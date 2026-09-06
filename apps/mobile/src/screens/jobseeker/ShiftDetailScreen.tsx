import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { shiftsApi } from '../../api';
import { Button, ErrorState, LoadingScreen } from '../../components';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { formatDate, formatTime } from '../../utils';
import type { RootStackParamList, Shift } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShiftDetail'>;

export function ShiftDetailScreen({ navigation, route }: Props) {
  const { shiftId } = route.params;
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [checkOutNotes, setCheckOutNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try { setShift(await shiftsApi.getShift(shiftId)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Failed to load shift'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [shiftId]);

  useEffect(() => { load(); }, [load]);

  const confirm = () => {
    Alert.alert('Confirm this shift?', 'By confirming, you agree to attend this shift and accept the current shift terms.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Confirm shift', onPress: async () => {
        setConfirming(true);
        try { setShift(await shiftsApi.confirmShift(shiftId)); }
        catch (confirmError) { Alert.alert('Could not confirm', confirmError instanceof Error ? confirmError.message : 'Please try again.'); }
        finally { setConfirming(false); }
      } },
    ]);
  };

  const decline = () => {
    const reason = declineReason.trim();
    Alert.alert('Decline this shift?', 'The client will be notified so they can arrange cover.', [
      { text: 'Keep shift', style: 'cancel' },
      { text: 'Decline shift', style: 'destructive', onPress: async () => {
        setShowDeclineModal(false);
        setDeclining(true);
        try {
          setShift(await shiftsApi.declineShift(shiftId, reason || undefined));
          setDeclineReason('');
        } catch (declineError) {
          Alert.alert('Could not decline', declineError instanceof Error ? declineError.message : 'Please try again.');
        } finally {
          setDeclining(false);
        }
      } },
    ]);
  };

  // Check-in is deliberately one tap with no confirmation: it happens on arrival,
  // often outdoors and in a hurry. Check-out is the one that writes hours to the
  // timesheet, so that one asks before it commits.
  const checkIn = async () => {
    setCheckingIn(true);
    try { setShift(await shiftsApi.checkIn(shiftId)); }
    catch (checkInError) { Alert.alert('Could not check in', checkInError instanceof Error ? checkInError.message : 'Please try again.'); }
    finally { setCheckingIn(false); }
  };

  const checkOut = async () => {
    setShowCheckOutModal(false);
    setCheckingOut(true);
    const notes = checkOutNotes.trim();
    try {
      setShift(await shiftsApi.checkOut(shiftId, notes || undefined));
      setCheckOutNotes('');
    } catch (checkOutError) {
      Alert.alert('Could not check out', checkOutError instanceof Error ? checkOutError.message : 'Please try again.');
    } finally { setCheckingOut(false); }
  };

  if (loading && !shift) return <LoadingScreen message="Loading shift..." />;
  if (error && !shift) return <SafeAreaView style={styles.container}><ErrorState message={error} onRetry={() => load()} /></SafeAreaView>;
  if (!shift) return null;

  const isPending = shift.status === 'PENDING';
  const onSite = Boolean(shift.checkedInAt) && !shift.checkedOutAt;
  const canCheckIn = shift.status === 'CONFIRMED' && !shift.checkedInAt;
  const hasAttendance = Boolean(shift.checkedInAt);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></TouchableOpacity><Text style={styles.headerTitle}>Shift details</Text><View style={styles.headerSpacer} /></View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
        <View style={[styles.statusCard, isPending && styles.pendingCard, shift.status === 'REJECTED' && styles.declinedCard]}><Text style={styles.statusTitle}>{isPending ? 'Confirmation needed' : shift.status === 'REJECTED' ? 'Shift declined' : shift.status.replace('_', ' ')}</Text><Text style={styles.statusText}>{isPending ? 'Confirm that you can attend this shift.' : shift.status === 'REJECTED' ? 'You declined this shift. The client has been notified.' : shift.status === 'CANCELLED' ? 'This shift was cancelled by the client.' : 'This shift is confirmed and saved to your schedule.'}</Text></View>
        {shift.status === 'CANCELLED' && shift.rejectionReason && <View style={styles.cancellationCard}><Text style={styles.cancellationTitle}>Cancellation reason</Text><Text style={styles.cancellationText}>{shift.rejectionReason}</Text></View>}
        {shift.status === 'REJECTED' && shift.rejectionReason && <View style={styles.cancellationCard}><Text style={styles.cancellationTitle}>Your decline note</Text><Text style={styles.cancellationText}>{shift.rejectionReason}</Text></View>}
        <View style={styles.section}><Text style={styles.eventName}>{shift.eventName || 'Event shift'}</Text><Text style={styles.company}>{shift.client.companyName}</Text><DetailRow icon="📅" label="Date" value={formatDate(shift.eventDate)} /><DetailRow icon="⏰" label="Time" value={`${formatTime(shift.shiftStart)} – ${formatTime(shift.shiftEnd)}`} /><DetailRow icon="📍" label="Location" value={`${shift.venue ? `${shift.venue}, ` : ''}${shift.location}`} /><DetailRow icon="👤" label="Contact" value={shift.client.contactName} /></View>
        <View style={styles.section}><Text style={styles.sectionTitle}>Pay</Text><DetailRow icon="💷" label="Rate" value={shift.staffPayRate != null ? `£${shift.staffPayRate.toFixed(2)} per hour` : 'To be confirmed'} />{shift.expectedPay != null && <DetailRow icon="✨" label="Estimated pay" value={`£${shift.expectedPay.toFixed(2)}`} />}</View>
        {shift.clientNotes && <View style={styles.section}><Text style={styles.sectionTitle}>Shift instructions</Text><Text style={styles.notes}>{shift.clientNotes}</Text></View>}
        {hasAttendance && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your timesheet</Text>
            <DetailRow icon="🟢" label="Checked in" value={formatTime(shift.checkedInAt!)} />
            {shift.checkedOutAt && <DetailRow icon="🔴" label="Checked out" value={formatTime(shift.checkedOutAt)} />}
            {shift.hoursWorked != null && <DetailRow icon="⏱️" label="Hours worked" value={`${shift.hoursWorked} hours`} />}
            {shift.workerShiftNotes && <DetailRow icon="📝" label="Your note" value={shift.workerShiftNotes} />}
            {onSite && <Text style={styles.attendanceHint}>You are checked in. Check out when you finish so your hours are recorded.</Text>}
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
      {isPending && <View style={styles.footer}><Button title={confirming ? 'Confirming…' : 'Confirm shift'} onPress={confirm} fullWidth disabled={confirming || declining} /><TouchableOpacity style={styles.declineButton} onPress={() => setShowDeclineModal(true)} disabled={confirming || declining}><Text style={styles.declineButtonText}>{declining ? 'Declining…' : 'Decline shift'}</Text></TouchableOpacity></View>}
      {canCheckIn && <View style={styles.footer}><Button title={checkingIn ? 'Checking in…' : 'Check in'} onPress={checkIn} fullWidth disabled={checkingIn} /><Text style={styles.footerHint}>Check in when you arrive on site.</Text></View>}
      {onSite && <View style={styles.footer}><Button title={checkingOut ? 'Checking out…' : 'Check out'} onPress={() => setShowCheckOutModal(true)} fullWidth disabled={checkingOut} /><Text style={styles.footerHint}>This records your hours for this shift.</Text></View>}
      <Modal visible={showDeclineModal} transparent animationType="fade" onRequestClose={() => setShowDeclineModal(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Decline this shift</Text><Text style={styles.modalCopy}>You can add an optional note for the client. They will be notified that you declined.</Text><TextInput style={styles.reasonInput} value={declineReason} onChangeText={setDeclineReason} placeholder="Optional reason" placeholderTextColor={colors.textMuted} multiline maxLength={500} textAlignVertical="top" autoFocus /><Text style={styles.characterCount}>{declineReason.length}/500</Text><View style={styles.modalActions}><TouchableOpacity onPress={() => setShowDeclineModal(false)}><Text style={styles.cancelAction}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={decline}><Text style={styles.confirmDeclineAction}>Continue</Text></TouchableOpacity></View></View></View>
      </Modal>
      <Modal visible={showCheckOutModal} transparent animationType="fade" onRequestClose={() => setShowCheckOutModal(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>Check out of this shift</Text><Text style={styles.modalCopy}>Your hours are recorded from when you checked in until now. Add a note if the shift overran or something went wrong.</Text><TextInput style={styles.reasonInput} value={checkOutNotes} onChangeText={setCheckOutNotes} placeholder="Optional note" placeholderTextColor={colors.textMuted} multiline maxLength={1000} textAlignVertical="top" /><Text style={styles.characterCount}>{checkOutNotes.length}/1000</Text><View style={styles.modalActions}><TouchableOpacity onPress={() => setShowCheckOutModal(false)}><Text style={styles.cancelAction}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={checkOut}><Text style={styles.confirmAction}>Check out</Text></TouchableOpacity></View></View></View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) { return <View style={styles.row}><Text style={styles.rowIcon}>{icon}</Text><View style={styles.rowCopy}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  back: { color: colors.primaryDark, fontSize: typography.fontSize.md, fontWeight: '600' as const }, headerTitle: { color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' as const }, headerSpacer: { width: 50 }, content: { padding: spacing.lg },
  statusCard: { backgroundColor: colors.successSoft, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg }, pendingCard: { backgroundColor: colors.warningSoft }, declinedCard: { backgroundColor: colors.errorSoft }, statusTitle: { color: colors.textPrimary, fontSize: typography.fontSize.lg, fontWeight: '700' as const, textTransform: 'capitalize' }, statusText: { color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  cancellationCard: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg }, cancellationTitle: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '700' as const }, cancellationText: { color: colors.textSecondary, fontSize: typography.fontSize.sm, lineHeight: 21, marginTop: spacing.xs },
  section: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md }, eventName: { color: colors.textPrimary, fontSize: typography.fontSize.xl, fontWeight: '700' as const }, company: { color: colors.textSecondary, fontSize: typography.fontSize.md, marginTop: spacing.xs, marginBottom: spacing.lg }, sectionTitle: { color: colors.textPrimary, fontSize: typography.fontSize.md, fontWeight: '700' as const, marginBottom: spacing.sm }, notes: { color: colors.textSecondary, fontSize: typography.fontSize.md, lineHeight: 23 },
  row: { flexDirection: 'row', paddingVertical: spacing.sm }, rowIcon: { width: 30, fontSize: typography.fontSize.md }, rowCopy: { flex: 1 }, rowLabel: { color: colors.textMuted, fontSize: typography.fontSize.xs }, rowValue: { color: colors.textPrimary, fontSize: typography.fontSize.md, marginTop: 2 }, footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.surfaceBorder }, declineButton: { alignItems: 'center', marginTop: spacing.md, paddingVertical: spacing.xs }, declineButtonText: { color: colors.error, fontSize: typography.fontSize.md, fontWeight: '700' as const }, modalOverlay: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0, 0, 0, 0.45)' }, modalCard: { backgroundColor: colors.surfaceStrong, borderRadius: borderRadius.lg, padding: spacing.lg }, modalTitle: { color: colors.textPrimary, fontSize: typography.fontSize.xl, fontWeight: '700' as const }, modalCopy: { color: colors.textSecondary, fontSize: typography.fontSize.sm, lineHeight: 20, marginTop: spacing.sm }, reasonInput: { minHeight: 112, marginTop: spacing.md, padding: spacing.md, color: colors.textPrimary, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: borderRadius.md, fontSize: typography.fontSize.md }, characterCount: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: typography.fontSize.xs, marginTop: spacing.xs }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.lg }, cancelAction: { color: colors.textSecondary, fontSize: typography.fontSize.md, fontWeight: '600' as const }, footerHint: { color: colors.textMuted, fontSize: typography.fontSize.xs, textAlign: 'center', marginTop: spacing.sm }, attendanceHint: { color: colors.textSecondary, fontSize: typography.fontSize.sm, lineHeight: 20, marginTop: spacing.sm }, confirmAction: { color: colors.primary, fontSize: typography.fontSize.md, fontWeight: '700' as const }, confirmDeclineAction: { color: colors.error, fontSize: typography.fontSize.md, fontWeight: '700' as const },
});

export default ShiftDetailScreen;
