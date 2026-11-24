import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '@/core/auth/authStore';

interface UserAvatarProps {
  userId?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  cacheKey?: string | number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
}

function getInitials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  name,
  avatarUrl,
  size = 44,
  cacheKey,
  backgroundColor = 'rgba(20, 184, 166, 0.2)',
  textColor = '#5EEAD4',
  borderColor = 'rgba(94, 234, 212, 0.45)',
}) => {
  const serverUrl = useAuthStore((s) => s.serverUrl);

  let uri: string | undefined;
  if (avatarUrl) {
    if (/^https?:\/\//i.test(avatarUrl)) {
      uri = avatarUrl;
    } else {
      const path = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
      uri = `${serverUrl}${path}`;
    }
  } else if (userId) {
    uri = `${serverUrl}/api/auth/avatar/${userId}`;
  }

  if (uri && cacheKey) {
    uri = `${uri}${uri.includes('?') ? '&' : '?'}r=${cacheKey}`;
  }

  const [failed, setFailed] = useState(!uri);

  useEffect(() => {
    setFailed(!uri);
  }, [uri]);

  const radiusStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2,
    borderColor,
  };

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, radiusStyle, { backgroundColor }]}>
        <Text style={[styles.initials, { color: textColor, fontSize: Math.round(size * 0.34) }]}>
          {getInitials(name)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      key={uri}
      source={{ uri }}
      style={radiusStyle}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
};

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '800',
  },
});
