/**
 * Edit Profile Screen
 * Job seeker profile editing
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { Input, Avatar, LoadingScreen } from '../../components';
import { useAuthStore, useUIStore, selectJobSeeker } from '../../store';
import { authApi } from '../../api';
import type { RootStackParamList, JobSeeker, JobRole, AvailabilityStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

const ROLES: { value: JobRole; label: string }[] = [
  { value: 'bartender', label: 'Bartender' },
  { value: 'server', label: 'Server' },
  { value: 'chef', label: 'Chef' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'kitchen_porter', label: 'Kitchen Porter' },
  { value: 'event_manager', label: 'Event Manager' },
  { value: 'front_of_house', label: 'Front of House' },
  { value: 'barista', label: 'Barista' },
  { value: 'runner', label: 'Runner' },
  { value: 'mixologist', label: 'Mixologist' },
];

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'limited', label: 'Limited Availability' },
  { value: 'unavailable', label: 'Not Available' },
];

export function EditProfileScreen({ navigation }: Props) {
  const { updateProfile, setUser, isLoading, error } = useAuthStore();
  const user = useAuthStore(selectJobSeeker);
  const { showToast } = useUIStore();

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [availability, setAvailability] = useState<AvailabilityStatus>('available');
  const [preferredRoles, setPreferredRoles] = useState<JobRole[]>([]);
  const [yearsExperience, setYearsExperience] = useState('');
  const [minimumHourlyRate, setMinimumHourlyRate] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  
  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhone(user.phone || '');
      setBio(user.bio || '');
      setCity(user.city || '');
      setPostcode(user.postcode || '');
      setAvailability(user.availability || 'available');
      setPreferredRoles(user.preferredRoles || []);
      setYearsExperience(user.yearsExperience?.toString() || '');
      setMinimumHourlyRate(user.minimumHourlyRate?.toString() || '');
    }
  }, [user]);
  
  const handleFieldChange = (setter: (v: string) => void, field?: string) => (value: string) => {
    setter(value);
    setHasChanges(true);
    if (field && validationErrors[field]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };
  
  const toggleRole = (role: JobRole) => {
    setHasChanges(true);
    if (preferredRoles.includes(role)) {
      setPreferredRoles(preferredRoles.filter(r => r !== role));
    } else {
      setPreferredRoles([...preferredRoles, role]);
    }
  };
  
  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo access to change your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setIsUploadingImage(true);
    try {
      const updatedUser = await authApi.uploadJobSeekerAvatar(uri);
      setUser(updatedUser);
      setHasChanges(false); // image saved immediately, no pending changes from this action
      showToast('Photo updated', 'success');
    } catch {
      showToast('Failed to upload photo. Please try again.', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';
    
    if (phone && !/^[\d\s+()-]{10,}$/.test(phone)) {
      errors.phone = 'Please enter a valid phone number';
    }
    
    if (postcode && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode)) {
      errors.postcode = 'Please enter a valid UK postcode';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleSave = async () => {
    if (!validate()) return;
    
    try {
      const updates: Partial<JobSeeker> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        city: city.trim() || undefined,
        postcode: postcode.trim().toUpperCase() || undefined,
        availability,
        preferredRoles,
        yearsExperience: parseInt(yearsExperience) || 0,
        minimumHourlyRate: parseFloat(minimumHourlyRate) || undefined,
      };
      
      await updateProfile(updates);
      showToast('Profile updated', 'success');
      navigation.goBack();
    } catch {
      showToast(error || 'Failed to update profile. Please try again.', 'error');
    }
  };
  
  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };
  
  if (!user) {
    return <LoadingScreen message="Loading profile..." />;
  }
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity 
          onPress={handleSave} 
          style={styles.headerButton}
          disabled={isLoading}
        >
          <Text style={[styles.saveText, isLoading && styles.disabledText]}>
            {isLoading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Photo */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={handlePickImage} disabled={isUploadingImage} style={styles.avatarTouchable}>
              <Avatar
                imageUri={user.profileImage}
                name={`${firstName || user.firstName} ${lastName || user.lastName}`}
                size={88}
              />
              {isUploadingImage && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={colors.textInverse} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImage} disabled={isUploadingImage}>
              <Text style={styles.changePhotoText}>
                {isUploadingImage ? 'Uploading…' : 'Change Photo'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Input
                  label="First Name"
                  value={firstName}
                  onChangeText={handleFieldChange(setFirstName, 'firstName')}
                  error={validationErrors.firstName}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.halfField}>
                <Input
                  label="Last Name"
                  value={lastName}
                  onChangeText={handleFieldChange(setLastName, 'lastName')}
                  error={validationErrors.lastName}
                  autoCapitalize="words"
                />
              </View>
            </View>
            
            <Input
              label="Phone"
              value={phone}
              onChangeText={handleFieldChange(setPhone, 'phone')}
              error={validationErrors.phone}
              keyboardType="phone-pad"
              placeholder="+44 7700 900000"
            />
            
            <Input
              label="Bio"
              value={bio}
              onChangeText={handleFieldChange(setBio)}
              multiline
              numberOfLines={4}
              placeholder="Tell employers about yourself..."
              maxLength={500}
            />
          </View>
          
          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            
            <Input
              label="City"
              value={city}
              onChangeText={handleFieldChange(setCity)}
              placeholder="London"
              autoCapitalize="words"
            />
            
            <Input
              label="Postcode"
              value={postcode}
              onChangeText={handleFieldChange(setPostcode, 'postcode')}
              error={validationErrors.postcode}
              placeholder="SW1A 1AA"
              autoCapitalize="characters"
            />
          </View>
          
          {/* Work Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Preferences</Text>
            
            {/* Availability */}
            <Text style={styles.fieldLabel}>Availability</Text>
            <View style={styles.optionsRow}>
              {AVAILABILITY_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    availability === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => {
                    setAvailability(option.value);
                    setHasChanges(true);
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    availability === option.value && styles.optionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Preferred Roles */}
            <Text style={styles.fieldLabel}>Preferred Roles</Text>
            <View style={styles.rolesGrid}>
              {ROLES.map(role => (
                <TouchableOpacity
                  key={role.value}
                  style={[
                    styles.roleChip,
                    preferredRoles.includes(role.value) && styles.roleChipActive,
                  ]}
                  onPress={() => toggleRole(role.value)}
                >
                  <Text style={[
                    styles.roleChipText,
                    preferredRoles.includes(role.value) && styles.roleChipTextActive,
                  ]}>
                    {role.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Input
                  label="Years Experience"
                  value={yearsExperience}
                  onChangeText={handleFieldChange(setYearsExperience)}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
              <View style={styles.halfField}>
                <Input
                  label="Min Hourly Rate (£)"
                  value={minimumHourlyRate}
                  onChangeText={handleFieldChange(setMinimumHourlyRate)}
                  keyboardType="decimal-pad"
                  placeholder="12.00"
                />
              </View>
            </View>
          </View>
          
          {/* Spacer */}
          <View style={{ height: 50 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
  },
  
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
  },
  
  saveText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600' as const,
    textAlign: 'right',
  },
  
  disabledText: {
    opacity: 0.5,
  },
  
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },

  avatarTouchable: {
    position: 'relative',
  },

  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  changePhotoText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },

  section: {
    marginTop: spacing.lg,
  },
  
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '600' as const,
    marginBottom: spacing.md,
  },
  
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  
  halfField: {
    flex: 1,
  },
  
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  
  optionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  
  optionButtonActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  
  optionText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500' as const,
  },
  
  optionTextActive: {
    color: colors.primary,
  },
  
  rolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  
  roleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  
  roleChipActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  
  roleChipText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  roleChipTextActive: {
    color: colors.primary,
    fontWeight: '500' as const,
  },
});

export default EditProfileScreen;
