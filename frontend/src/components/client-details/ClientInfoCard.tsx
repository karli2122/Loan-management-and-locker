import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { Client } from './types';

// Credit score color helper
const getCreditScoreColor = (score: number) => {
  if (score >= 800) return '#10B981';
  if (score >= 650) return '#3B82F6';
  if (score >= 500) return '#F59E0B';
  if (score >= 350) return '#F97316';
  return '#EF4444';
};

interface Props {
  client: Client;
  language: string;
  colors: any;
  t: (key: string) => string;
  isSuperAdmin: boolean;
  userCredits: number;
  generatingCode: boolean;
  onGenerateCode: () => void;
}

export const ClientInfoCard = ({
  client, language, colors, t,
  isSuperAdmin, userCredits, generatingCode, onGenerateCode,
}: Props) => (
  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
    <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
      <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
    </View>
    <View style={styles.clientNameWithScore}>
      <Text style={[styles.clientName, { color: colors.text }]}>{client.name}</Text>
      {client.credit_score != null && (
        <View style={[styles.creditScoreBadge, { backgroundColor: getCreditScoreColor(client.credit_score) + '20' }]}>
          <Ionicons name="star" size={12} color={getCreditScoreColor(client.credit_score)} />
          <Text style={[styles.creditScoreValue, { color: getCreditScoreColor(client.credit_score) }]}>{client.credit_score}</Text>
        </View>
      )}
    </View>
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
            ? (language === 'et' ? 'Admin režiim SEES' : 'Admin mode ON')
            : (language === 'et' ? 'Admin režiim VÄLJAS' : 'Admin mode OFF')}
        </Text>
      </View>
    )}
    <View style={styles.regCodeRow}>
      {client.registration_code ? (
        <>
          <Text style={[styles.regCode, { color: colors.textMuted }]}>{t('registrationCode')}: {client.registration_code}</Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={async () => {
              await Share.share({ message: client.registration_code });
            }}
          >
            <Ionicons name="copy" size={18} color={colors.textMuted} />
            <Text style={[styles.copyText, { color: colors.textMuted }]}>{t('copy')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={[styles.regCodeHidden, { color: colors.textMuted }]}>
          {language === 'et' ? 'Võtit pole veel genereeritud' : 'Key not generated yet'}
        </Text>
      )}
    </View>
    <TouchableOpacity
      style={[
        styles.generateKeyButton,
        (!isSuperAdmin && userCredits <= 0) && styles.generateKeyButtonDisabled,
      ]}
      onPress={onGenerateCode}
      disabled={generatingCode || (!isSuperAdmin && userCredits <= 0)}
      data-testid="generate-key-button"
    >
      {generatingCode ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Ionicons name="key" size={16} color="#fff" />
          <Text style={styles.generateKeyButtonText}>
            {client.registration_code
              ? (language === 'et' ? 'Regenereeri võti' : 'Regenerate key')
              : (language === 'et' ? 'Genereeri võti' : 'Generate key')}
          </Text>
        </>
      )}
      <View style={styles.creditBadge}>
        <Ionicons name="ticket" size={12} color="#F59E0B" />
        <Text style={styles.creditBadgeText}>
          {isSuperAdmin ? '\u221E' : userCredits}
        </Text>
      </View>
    </TouchableOpacity>
  </View>
);
