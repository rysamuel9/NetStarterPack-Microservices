import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/core/theme/themeStore';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.warning,
          paddingTop: Math.max(insets.top, 8),
        },
      ]}
    >
      <WifiOff size={15} color="#FFFFFF" />
      <Text style={styles.text}>Mode Offline — Menampilkan data cache terakhir</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
