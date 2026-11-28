import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

/**
 * Plain error screen (react-native only, no contexts, no network): shown instead of a frozen splash
 * when the app fails while starting or a screen crashes.
 */
export function StartupError({ error, onRetry }: { error: any; onRetry?: () => void }) {
  const message = String(error?.message ?? error ?? 'Unknown error');
  const detail = String(error?.stack ?? '').split('\n').slice(0, 6).join('\n');
  const version = Constants.expoConfig?.version ?? '';
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/paylock-logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>PayLock could not start / PayLock ei käivitunud</Text>
      <Text style={styles.sub}>
        Please close and reopen the app. If it keeps happening, send this screen to support.{'\n'}
        Palun sulge ja ava rakendus uuesti. Kui probleem kordub, saada see ekraan toele.
      </Text>
      <ScrollView style={styles.box}>
        <Text style={styles.msg}>{message}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {version ? <Text style={styles.detail}>v{version}</Text> : null}
      </ScrollView>
      {onRetry ? (
        <TouchableOpacity style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>Try again / Proovi uuesti</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', padding: 24, paddingTop: 70 },
  logo: { width: 120, height: 120, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#0B1527', textAlign: 'center' },
  sub: { fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  box: { alignSelf: 'stretch', marginTop: 16, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, maxHeight: 260 },
  msg: { fontSize: 13, color: '#B91C1C', fontWeight: '700' },
  detail: { fontSize: 11, color: '#475569', marginTop: 6 },
  btn: { marginTop: 18, backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
