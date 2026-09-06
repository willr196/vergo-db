/**
 * Shown when a client account signs in to the worker app.
 *
 * The client experience is out of scope for this release (see
 * docs/mobile-mvp-scope.md). The screens still exist under src/screens/client
 * but are not in the navigator, so a client session would otherwise land on
 * nothing. Rather than block the login, we explain where to go and offer a way
 * out, which also covers anyone still signed in from an earlier build.
 */

import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components';
import { useAuthStore } from '../store';
import { borderRadius, colors, spacing, typography } from '../theme';

const QUOTE_URL = 'https://vergoltd.com/hire/quote';

export function ClientOnWebScreen() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Hiring staff</Text>
          <Text style={styles.title}>Bookings are handled on the website</Text>
          <Text style={styles.copy}>
            This app is for the people working the shifts. To book staff, send us the date, the venue
            and the roles at vergoltd.com and you get a same-day answer on anything between 8am and 10pm.
          </Text>
          <Text style={styles.copy}>
            Nothing has happened to your account. You can still sign in on the website exactly as before.
          </Text>
          <Button
            title="Get a quote"
            onPress={() => Linking.openURL(QUOTE_URL)}
            variant="primary"
            size="lg"
            fullWidth
          />
          <Button
            title="Sign out"
            onPress={() => { void logout(); }}
            variant="outline"
            size="lg"
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '700',
    lineHeight: 30,
  },
  copy: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    lineHeight: 22,
  },
});

export default ClientOnWebScreen;
