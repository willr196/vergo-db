/**
 * Edit Client Profile Screen
 * Allows client companies to update their profile via authApi.updateClientProfile
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography } from '../../theme';
import { useAuthStore, useUIStore, selectClient } from '../../store';
import { Input, Avatar } from '../../components';
import { authApi } from '../../api';
import { logger } from '../../utils/logger';
import type { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditClientProfile'>;

export function EditClientProfileScreen({ navigation }: Props) {
  const company = useAuthStore(selectClient);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const setUser = useAuthStore((state) => state.setUser);
  const { showToast } = useUIStore();

  const [companyName, setCompanyName] = useState(company?.companyName ?? '');
  const [contactFirstName, setContactFirstName] = useState(company?.contactFirstName ?? '');
  const [contactLastName, setContactLastName] = useState(company?.contactLastName ?? '');
  const [phone, setPhone] = useState(company?.phone ?? '');
  const [description, setDescription] = useState(company?.description ?? '');
  const [website, setWebsite] = useState(company?.website ?? '');
  const [address, setAddress] = useState(company?.address ?? '');
  const [city, setCity] = useState(company?.city ?? '');
  const [postcode, setPostcode] = useState(company?.postcode ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) => {
    if (validationErrors[field]) {
      setValidationErrors(prev => { const updated = { ...prev }; delete updated[field]; return updated; });
    }
  };

  const handlePickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo access to change your company logo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    setIsUploadingLogo(true);
    try {
      const updatedCompany = await authApi.uploadClientLogo(result.assets[0].uri);
      setUser(updatedCompany);
      showToast('Logo updated', 'success');
    } catch (error) {
      logger.error('Failed to upload logo:', error);
      showToast('Failed to upload logo. Please try again.', 'error');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!companyName.trim()) errors.companyName = 'Company name is required';
    if (!contactFirstName.trim()) errors.contactFirstName = 'First name is required';
    if (!contactLastName.trim()) errors.contactLastName = 'Last name is required';

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});

    setIsSaving(true);
    try {
      await updateProfile({
        companyName: companyName.trim(),
        contactFirstName: contactFirstName.trim(),
        contactLastName: contactLastName.trim(),
        phone: phone.trim() || undefined,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        postcode: postcode.trim() || undefined,
      });
      showToast('Profile saved', 'success');
      navigation.goBack();
    } catch (error) {
      logger.error('Failed to update client profile:', error);
      showToast('Failed to save profile. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.headerButton}>
            <Text style={[styles.saveText, isSaving && styles.saveTextDisabled]}>
              {isSaving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Company Logo */}
          <View style={styles.logoSection}>
            <TouchableOpacity onPress={handlePickLogo} disabled={isUploadingLogo} style={styles.logoTouchable}>
              <Avatar
                imageUri={company?.logo}
                name={companyName || company?.companyName || 'Company'}
                size={88}
              />
              {isUploadingLogo && (
                <View style={styles.logoOverlay}>
                  <ActivityIndicator color={colors.textInverse} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickLogo} disabled={isUploadingLogo}>
              <Text style={styles.changeLogoText}>
                {isUploadingLogo ? 'Uploading…' : 'Change Logo'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Company</Text>
            <Input
              label="Company Name"
              value={companyName}
              onChangeText={(t) => { setCompanyName(t); clearFieldError('companyName'); }}
              placeholder="Your company name"
              error={validationErrors.companyName}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Person</Text>
            <Input
              label="First Name"
              value={contactFirstName}
              onChangeText={(t) => { setContactFirstName(t); clearFieldError('contactFirstName'); }}
              placeholder="First name"
              error={validationErrors.contactFirstName}
            />
            <Input
              label="Last Name"
              value={contactLastName}
              onChangeText={(t) => { setContactLastName(t); clearFieldError('contactLastName'); }}
              placeholder="Last name"
              error={validationErrors.contactLastName}
            />
            <Input
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+44 7700 900000"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Tell staff about your company…"
              multiline
              numberOfLines={4}
            />
            <Input
              label="Website"
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yourcompany.com"
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address</Text>
            <Input
              label="Street Address"
              value={address}
              onChangeText={setAddress}
              placeholder="123 Main Street"
            />
            <Input
              label="City"
              value={city}
              onChangeText={setCity}
              placeholder="London"
            />
            <Input
              label="Postcode"
              value={postcode}
              onChangeText={setPostcode}
              placeholder="SW1A 1AA"
              autoCapitalize="characters"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  headerButton: {
    paddingVertical: spacing.xs,
    minWidth: 60,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  saveText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    textAlign: 'right',
  },
  saveTextDisabled: {
    opacity: 0.5,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  logoSection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  logoTouchable: {
    position: 'relative',
  },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeLogoText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
});

export default EditClientProfileScreen;
