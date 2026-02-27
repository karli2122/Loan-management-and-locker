import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import type { Client } from './types';

interface Props {
  client: Client;
  colors: any;
  language: string;
  t: (key: string) => string;
  isSuperAdmin: boolean;
  generatingCode: boolean;
  onGenerateCode: () => void;
}

export const ClientInfoCard = ({
  client, colors, language, t, isSuperAdmin, generatingCode, onGenerateCode,
}: Props) => (
  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
    <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
      <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
    </View>
    <Text style={[styles.clientName, { color: colors.text }]}>{client.name}</Text>

    <View style={[styles.statusBadge, client.is_locked ? styles.lockedBadge : styles.unlockedBadge]}>
      <Ionicons
        name={client.is_locked ? 'lock-closed' : 'lock-open'}
        size={14}
        color={client.is_locked ? colors.error : colors.success}
      />
      <Text style={[styles.statusText, client.is_locked ? styles.lockedText : styles.unlockedText]}>
        {client.is_locked ? t('locked') : t('unlocked')}
      </Text>
    </View>

    {client.is_registered && (
      <View style={[styles.statusBadge, client.admin_mode_active ? styles.adminModeBadge : styles.adminModeOffBadge]}>
        <Ionicons
          name={client.admin_mode_active ? 'shield-checkmark' : 'shield'}
          size={14}
          color={client.admin_mode_active ? '#3B82F6' : colors.warning}
        />
        <Text style={[styles.statusText, client.admin_mode_active ? styles.adminModeText : styles.adminModeOffText]}>
          {client.admin_mode_active
            ? (t('adminModeOn'))
            : (t('adminModeOff'))}
        </Text>
      </View>
    )}

    <View style={styles.regCodeRow}>
      {client.registration_code ? (
        <>
          <Text style={[styles.regCode, { color: colors.textMuted }]}>{t('registrationCode')}: {client.registration_code}</Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={async () => { await Share.share({ message: client.registration_code }); }}
          >
            <Ionicons name="copy" size={18} color={colors.textMuted} />
            <Text style={[styles.copyText, { color: colors.textMuted }]}>{t('copy')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={[styles.regCodeHidden, { color: colors.textMuted }]}>
          {t('keyNotGeneratedYet')}
        </Text>
      )}
    </View>

    <TouchableOpacity
      style={styles.generateKeyButton}
      onPress={onGenerateCode}
      disabled={generatingCode}
      data-testid="generate-key-button"
    >
      {generatingCode ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Ionicons name="key" size={16} color="#fff" />
          <Text style={styles.generateKeyButtonText}>
            {client.registration_code
              ? (t('regenerateKey'))
              : (t('generateKey'))}
          </Text>
        </>
      )}
    </TouchableOpacity>
  </View>
);
