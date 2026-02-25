import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Clipboard, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

type ActivationMethod = 'adb' | 'qr' | 'nfc';

export default function BusinessManagement() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [activationMethod, setActivationMethod] = useState<ActivationMethod>('adb');

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{language === 'et' ? 'Ärihaldus' : 'Business Management'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Mode Comparison */}
        <View style={s.row}>
          <View style={s.modeCard}>
            <View style={[s.modeBadge, { backgroundColor: '#2563EB20' }]}>
              <Ionicons name="shield-half" size={24} color="#2563EB" />
            </View>
            <Text style={s.modeTitle}>Device Admin</Text>
            <Text style={s.modeDesc}>
              {language === 'et' ? '8-kohaline kood\nStandardne lukustus\nKasutaja saab keelata' : '8-digit code\nStandard lock\nUser can disable'}
            </Text>
          </View>
          <View style={s.modeCard}>
            <View style={[s.modeBadge, { backgroundColor: '#F9731620' }]}>
              <Ionicons name="shield-checkmark" size={24} color="#F97316" />
            </View>
            <Text style={[s.modeTitle, { color: '#F97316' }]}>Device Owner</Text>
            <Text style={s.modeDesc}>
              {language === 'et' ? '9-kohaline kood\nTäielik kiosk-režiim\nEi saa keelata' : '9-digit code\nFull kiosk mode\nCannot be disabled'}
            </Text>
          </View>
        </View>

        {/* Activation Method Tabs */}
        <Text style={s.sectionTitle}>{language === 'et' ? 'Aktiveerimismeetod' : 'Activation Method'}</Text>
        <View style={s.tabs}>
          {(['adb', 'qr', 'nfc'] as ActivationMethod[]).map((m) => (
            <TouchableOpacity key={m} style={[s.tab, activationMethod === m && s.tabActive]} onPress={() => setActivationMethod(m)}>
              <Ionicons name={m === 'adb' ? 'terminal' : m === 'qr' ? 'qr-code' : 'bluetooth'} size={18} color={activationMethod === m ? '#fff' : '#94A3B8'} />
              <Text style={[s.tabText, activationMethod === m && s.tabTextActive]}>{m === 'adb' ? 'ADB' : m === 'qr' ? 'QR Code' : 'NFC'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ADB Instructions */}
        {activationMethod === 'adb' && (
          <View style={s.box}>
            <View style={s.boxHeader}><Ionicons name="terminal" size={20} color="#F97316" /><Text style={s.boxTitle}>{language === 'et' ? 'ADB aktiveerimine' : 'ADB Activation'}</Text></View>
            <Text style={s.label}>{language === 'et' ? 'Eeltingimused:' : 'Prerequisites:'}</Text>
            <Text style={s.step}>{language === 'et'
              ? '1. Installige ADB arvutisse\n2. Lubage USB silumine seadmes\n3. Ühendage seade USB-ga'
              : '1. Install ADB on your computer\n2. Enable USB Debugging on device\n3. Connect device via USB'}</Text>
            <Text style={[s.label, { marginTop: 12 }]}>{language === 'et' ? 'Sammud:' : 'Steps:'}</Text>
            <Text style={s.step}>{language === 'et'
              ? '1. Tehaseseadistage seade\n2. Ärge lisage Google kontot\n3. Lubage USB silumine\n4. Käivitage terminal:'
              : '1. Factory reset the device\n2. Do NOT add a Google account\n3. Enable USB Debugging\n4. Run in terminal:'}</Text>
            <View style={s.code}>
              <Text style={s.codeText} selectable>adb shell dpm set-device-owner{'\n'}com.paylock.client/.DeviceAdminReceiver</Text>
              <TouchableOpacity style={s.copyBtn} onPress={() => { try { Clipboard.setString('adb shell dpm set-device-owner com.paylock.client/.DeviceAdminReceiver'); } catch(e){} }}>
                <Ionicons name="copy" size={16} color="#2563EB" />
              </TouchableOpacity>
            </View>
            <Text style={s.step}>{language === 'et'
              ? '5. "Success" = Device Owner aktiveeritud\n6. Installige PayLock Client ja registreerige 9-kohalise koodiga'
              : '5. "Success" = Device Owner activated\n6. Install PayLock Client and register with 9-digit code'}</Text>
            <View style={s.warn}><Ionicons name="warning" size={18} color="#F59E0B" /><Text style={s.warnText}>{language === 'et' ? 'Seadmel ei tohi olla kontosid!' : 'Device must have no accounts!'}</Text></View>
          </View>
        )}

        {/* QR Code */}
        {activationMethod === 'qr' && (
          <View style={s.box}>
            <View style={s.boxHeader}><Ionicons name="qr-code" size={20} color="#F97316" /><Text style={s.boxTitle}>{language === 'et' ? 'QR-koodi aktiveerimine' : 'QR Code Activation'}</Text></View>
            <Text style={s.step}>{language === 'et'
              ? '1. Tehaseseadistage seade\n2. Puudutage tervitusekraanil 6x kiirelt\n3. Ühenduge WiFi-ga\n4. Skaneerige QR-kood\n5. Seade seadistab Device Owner automaatselt'
              : '1. Factory reset the device\n2. Tap 6 times rapidly on welcome screen\n3. Connect to WiFi\n4. Scan the QR code\n5. Device configures Device Owner automatically'}</Text>
            <TouchableOpacity style={s.genBtn} onPress={async () => {
              try {
                const token = await AsyncStorage.getItem('admin_token');
                if (!token) return;
                const resp = await fetch(`${API_URL}/api/provisioning/qr-code?admin_token=${token}`);
                if (!resp.ok) throw new Error('Failed');
                Alert.alert('QR Code Generated', language === 'et' ? 'QR-kood genereeritud!' : 'QR code generated! Use during device setup.');
              } catch (e: any) { Alert.alert('Error', e.message); }
            }}>
              <Ionicons name="qr-code" size={18} color="#fff" />
              <Text style={s.genBtnText}>{language === 'et' ? 'Genereeri QR-kood' : 'Generate QR Code'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* NFC */}
        {activationMethod === 'nfc' && (
          <View style={s.box}>
            <View style={s.boxHeader}><Ionicons name="bluetooth" size={20} color="#F97316" /><Text style={s.boxTitle}>{language === 'et' ? 'NFC aktiveerimine' : 'NFC Activation'}</Text></View>
            <Text style={s.step}>{language === 'et'
              ? '1. Vaja NFC programmeerimisseadet\n2. Tehaseseadistage seade\n3. Puudutage NFC-silt seadmele\n4. Device Owner aktiveeritakse automaatselt'
              : '1. Requires NFC programming device\n2. Factory reset target device\n3. Tap NFC tag to device\n4. Device Owner activates automatically'}</Text>
            <TouchableOpacity style={s.genBtn} onPress={async () => {
              try {
                const token = await AsyncStorage.getItem('admin_token');
                if (!token) return;
                const resp = await fetch(`${API_URL}/api/provisioning/qr-code?admin_token=${token}`);
                if (!resp.ok) throw new Error('Failed');
                Alert.alert('NFC Payload', language === 'et' ? 'NFC andmed genereeritud!' : 'NFC payload generated! Write to NFC tag using NFC Tools app.');
              } catch (e: any) { Alert.alert('Error', e.message); }
            }}>
              <Ionicons name="bluetooth" size={18} color="#fff" />
              <Text style={s.genBtnText}>{language === 'et' ? 'Genereeri NFC andmed' : 'Generate NFC Payload'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Troubleshooting */}
        <View style={[s.box, { marginTop: 12 }]}>
          <View style={s.boxHeader}><Ionicons name="help-circle" size={20} color="#3B82F6" /><Text style={s.boxTitle}>{language === 'et' ? 'Veaotsing' : 'Troubleshooting'}</Text></View>
          <Text style={s.step}>{language === 'et'
            ? '• "Restricted settings unavailable" — Android 13+ nõuab süsteemirakendust\n\n• "Already several accounts" — Eemaldage kõik kontod\n\n• "Not allowed to set device owner" — Tehaseseadistage ilma kontodeta'
            : '• "Restricted settings unavailable" — Android 13+ requires system app\n\n• "Already several accounts" — Remove all accounts first\n\n• "Not allowed to set device owner" — Factory reset without accounts'}</Text>
        </View>

        {/* Contact Support */}
        <TouchableOpacity style={s.contactBtn} onPress={() => Linking.openURL('mailto:paylockpro@gmail.com?subject=Business%20Management%20Support')}>
          <Ionicons name="mail" size={20} color="#fff" />
          <Text style={s.contactBtnText}>{language === 'et' ? 'Võta ühendust toega' : 'Contact Support'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E3050' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#152035', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  scroll: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  modeCard: { flex: 1, backgroundColor: '#152035', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1E3050' },
  modeBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modeTitle: { fontSize: 15, fontWeight: '700', color: '#F8FAFC', marginBottom: 6 },
  modeDesc: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 18 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#152035', borderWidth: 1, borderColor: '#1E3050' },
  tabActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  tabTextActive: { color: '#fff' },
  box: { backgroundColor: '#152035', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1E3050' },
  boxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  boxTitle: { fontSize: 16, fontWeight: '700', color: '#F8FAFC' },
  label: { fontSize: 13, fontWeight: '600', color: '#CBD5E1', marginBottom: 4 },
  step: { fontSize: 13, color: '#94A3B8', lineHeight: 20 },
  code: { backgroundColor: '#0B1527', borderRadius: 8, padding: 12, marginVertical: 10, flexDirection: 'row', alignItems: 'flex-start' },
  codeText: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: '#10B981', lineHeight: 18 },
  copyBtn: { padding: 4, marginLeft: 8 },
  warn: { flexDirection: 'row', gap: 8, backgroundColor: '#F59E0B15', borderRadius: 8, padding: 12, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  warnText: { flex: 1, fontSize: 12, color: '#FBBF24', lineHeight: 18 },
  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F97316', borderRadius: 10, paddingVertical: 12, marginTop: 12 },
  genBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, marginTop: 24 },
  contactBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
