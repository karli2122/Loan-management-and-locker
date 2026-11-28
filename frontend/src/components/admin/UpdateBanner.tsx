import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ta } from '../../utils/adminI18n';

/** Shown when the server reports a newer admin version. Hidden for non-forced updates once dismissed. */
export function UpdateBanner({ info, language }: { info: any; language: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (!info || (dismissed && !info.force_update)) return null;
  const open = async () => {
    const url = info.download_url;
    if (!url) {
      Alert.alert(ta(language, 'updateAvailable'), String(info.latest_version || info.version || ''));
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(ta(language, 'updateAvailable'), url);
    }
  };
  return (
    <View style={{ backgroundColor: '#1D4ED8', borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="cloud-download" size={20} color="#fff" />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{ta(language, 'updateAvailable')}</Text>
        {!!(info.latest_version || info.version) && <Text style={{ color: '#DBEAFE', fontSize: 12 }}>{info.latest_version || info.version}</Text>}
        {!!info.release_notes && <Text style={{ color: '#DBEAFE', fontSize: 12 }} numberOfLines={2}>{info.release_notes}</Text>}
      </View>
      <TouchableOpacity onPress={open} style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 }}>
        <Text style={{ color: '#1D4ED8', fontWeight: '700' }}>{ta(language, 'updateNow')}</Text>
      </TouchableOpacity>
      {!info.force_update && (
        <TouchableOpacity onPress={() => setDismissed(true)} style={{ marginLeft: 8 }}>
          <Ionicons name="close" size={18} color="#DBEAFE" />
        </TouchableOpacity>
      )}
    </View>
  );
}
