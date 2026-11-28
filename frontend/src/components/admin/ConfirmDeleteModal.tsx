import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ta } from '../../utils/adminI18n';

interface Props {
  visible: boolean;
  clientName: string;
  language: string;
  /** True when the phone is registered and uninstall has not been allowed yet. */
  blockedRegistered: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel: string;
}

/** Hard-delete guard: blocks while a phone is still enrolled, otherwise requires typing the name. */
export function ConfirmDeleteModal({ visible, clientName, language, blockedRegistered, busy, onCancel, onConfirm, cancelLabel }: Props) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);
  const matches = typed.trim().toLowerCase() === (clientName || '').trim().toLowerCase() && typed.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#152035', borderRadius: 16, padding: 20 }}>
          <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginBottom: 10 }}>{ta(language, 'deleteGuardTitle')}</Text>
          {blockedRegistered ? (
            <Text style={{ color: '#FBBF24', fontSize: 14, lineHeight: 20 }}>{ta(language, 'deleteGuardRegistered')}</Text>
          ) : (
            <>
              <Text style={{ color: '#CBD5E1', fontSize: 14, lineHeight: 20, marginBottom: 10 }}>{ta(language, 'deleteGuardType')}</Text>
              <Text style={{ color: '#F8FAFC', fontWeight: '700', marginBottom: 8 }}>{clientName}</Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ backgroundColor: '#0B1527', color: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#334155' }}
                placeholder={clientName}
                placeholderTextColor="#475569"
              />
            </>
          )}
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <TouchableOpacity onPress={onCancel} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center', marginRight: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{cancelLabel}</Text>
            </TouchableOpacity>
            {!blockedRegistered && (
              <TouchableOpacity
                disabled={!matches || busy}
                onPress={onConfirm}
                style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: matches ? '#DC2626' : '#7F1D1D', opacity: matches ? 1 : 0.5, alignItems: 'center' }}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{ta(language, 'deleteForever')}</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
