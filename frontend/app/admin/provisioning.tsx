import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/context/ThemeContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';

export default function ProvisioningPage() {
  return (
    <EnterpriseGate featureName="Device Provisioning">
      <ProvisioningContent />
    </EnterpriseGate>
  );
}

function ProvisioningContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  const generateQR = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      let url = `${API_URL}/api/provisioning/qr-code?admin_token=${token}`;
      if (wifiSsid) url += `&wifi_ssid=${encodeURIComponent(wifiSsid)}`;
      if (wifiPassword) url += `&wifi_password=${encodeURIComponent(wifiPassword)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.qr_code_base64) {
        setQrData(`data:image/png;base64,${data.qr_code_base64}`);
      } else if (data.error) {
        Alert.alert('Error', data.error);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="provisioning-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="provisioning-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Device Provisioning</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Ionicons name="qr-code" size={40} color="#2563EB" style={{ alignSelf: 'center' }} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>QR Code Provisioning</Text>
          <Text style={styles.cardDesc}>
            Generate a QR code for Android Device Owner enrollment. When scanned during device setup (tap 6 times on welcome screen), it will install PayLock Pro as Device Owner.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>WiFi Configuration (Optional)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: '#334155' }]}
            placeholder="WiFi SSID"
            placeholderTextColor="#64748B"
            value={wifiSsid}
            onChangeText={setWifiSsid}
            data-testid="wifi-ssid"
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: '#334155' }]}
            placeholder="WiFi Password"
            placeholderTextColor="#64748B"
            secureTextEntry
            value={wifiPassword}
            onChangeText={setWifiPassword}
            data-testid="wifi-password"
          />
        </View>

        <TouchableOpacity
          style={[styles.genBtn, loading && styles.genBtnDisabled]}
          onPress={generateQR}
          disabled={loading}
          data-testid="generate-qr-btn"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.genBtnText}>Generate QR Code</Text>
            </>
          )}
        </TouchableOpacity>

        {qrData && (
          <View style={[styles.qrCard, { backgroundColor: colors.card }]} data-testid="qr-result">
            <Image source={{ uri: qrData }} style={styles.qrImage} resizeMode="contain" />
            <Text style={styles.qrInstructions}>
              Scan this QR code during Android device factory reset setup to provision the device with PayLock Pro.
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>How It Works</Text>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Factory reset the target device</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Tap 6 times on the welcome screen</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Scan the generated QR code</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Device will auto-provision with PayLock Pro</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  title: { fontSize: 18, fontWeight: '700' },
  card: { padding: 16, borderRadius: 12, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#64748B', lineHeight: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14 },
  genBtn: { backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginBottom: 20 },
  genBtnDisabled: { opacity: 0.6 },
  genBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  qrCard: { alignItems: 'center', padding: 24, borderRadius: 12, marginBottom: 20 },
  qrImage: { width: 250, height: 250, backgroundColor: '#fff', borderRadius: 8 },
  qrInstructions: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 16, lineHeight: 20 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14 },
});
