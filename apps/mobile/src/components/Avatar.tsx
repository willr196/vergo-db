/**
 * Avatar Component
 * Displays a user or company avatar with image caching and initials fallback.
 * Uses expo-image for memory-disk caching.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme';

interface AvatarProps {
  /** Image URL from backend — null/undefined shows initials instead */
  imageUri?: string | null;
  /** Used to derive initials when no image is available */
  name: string;
  /** Diameter in dp. Defaults to 60. */
  size?: number;
  /** Shows a small edit badge in the bottom-right corner */
  showEditButton?: boolean;
  onEditPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({
  imageUri,
  name,
  size = 60,
  showEditButton = false,
  onEditPress,
  style,
}: AvatarProps) {
  const radius = size / 2;
  const fontSize = Math.round(size * 0.35);
  const badgeSize = Math.round(size * 0.36);

  return (
    <View style={[{ width: size, height: size }, style]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size, borderRadius: radius }}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: radius }]}>
          <Text style={[styles.initials, { fontSize }]}>{getInitials(name)}</Text>
        </View>
      )}

      {showEditButton && (
        <TouchableOpacity
          style={[
            styles.editBadge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              bottom: 0,
              right: 0,
            },
          ]}
          onPress={onEditPress}
          activeOpacity={0.75}
        >
          <Text style={styles.editBadgeIcon}>✎</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  editBadge: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeIcon: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});

export default Avatar;
