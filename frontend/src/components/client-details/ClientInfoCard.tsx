import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClientChips } from '../admin/ClientChips';
import { shareHandover } from '../../utils/handover';
import { ta } from '../../utils/adminI18n';
import { styles } from './styles';
import { Client } from './types';
import { StatusChip } from '../../theme/StatusChip';

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
  generatingCode: boolean;
  onGenerateCode: () => void;
  canAccessCreditScore?: boolean;
  canAccessDeviceLock?: boolean;
  canAccessRegistrationCode?: boolean;
}

export const ClientInfoCard = ({
  client, language, colors, t,
  isSuperAdmin, generatingCode, onGenerateCode,
  canAccessCreditScore = true,
  canAccessDeviceLock = true,
  canAccessRegistrationCode = true,
}: Props) => {
  // Check if uninstall is allowed - hide device info, reg code, etc.
  const isUninstallAllowed = client.uninstall_allowed === true;
  
  return (
  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
    <View style={[styles.avatarContainer, { backgroundColor: colors.primary }]}>
      <Text style={styles.avatarText}>{(client.name || '?').charAt(0).toUpperCase()}</Text>
    </View>
    <View style={styles.clientNameWithScore}>
      <Text style={[styles.clientName, { color: colors.text }]}>{client.name}</Text>
      {/* Keep credit score visible even when uninstall allowed */}
      {canAccessCreditScore && client.credit_score != null && (
        <View style={[styles.creditScoreBadge, { backgroundColor: getCreditScoreColor(client.credit_score) + '20' }]}>
          <Ionicons name="star" size={12} color={getCreditScoreColor(client.credit_score)} />
          <Text style={[styles.creditScoreValue, { color: getCreditScoreColor(client.credit_score) }]}>{client.credit_score}</Text>
        </View>
      )}
    </View>
    {/* Show "Uninstall Allowed" instead of locked/unlocked when uninstall is allowed */}
    {isUninstallAllowed ? (
      <View style={[styles.statusBadge, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
        <Ionicons name="exit-outline" size={14} color="#8B5CF6" />
        <Text style={[styles.statusText, { color: '#8B5CF6' }]}>
          {t('uninstallAllowed') || 'Uninstall Allowed'}
        </Text>
      </View>
    ) : canAccessDeviceLock && (
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
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
        {/* Loan standing, separate from the device lock state */}
        <StatusChip
          compact
          input={{
            outstanding_balance: client.outstanding_balance,
            days_overdue: client.days_overdue,
            loan_due_date: client.loan_due_date,
            next_payment_due: (client as any).next_payment_due || client.emi_due_date,
            loan_amount: client.loan_amount,
            total_amount_due: client.total_amount_due,
            total_paid: (client as any).total_paid,
          }}
        />
      </View>
    )}
    {/* Hide admin mode section if uninstall allowed */}
    {client.is_registered && !isUninstallAllowed && (
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
    <View style={{ paddingHorizontal: 4, marginBottom: 6 }}>
      <ClientChips client={client} language={language} showLock={false} />
    </View>
    {/* Hide registration code section if uninstall allowed */}
    {!isUninstallAllowed && (
    <View style={styles.regCodeRow}>
      {client.registration_code ? (
        <>
          <Text style={[styles.regCode, { color: colors.textMuted }]}>{t('registrationCode')}: {client.registration_code}</Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => shareHandover({ name: client.name, code: client.registration_code, language })}
            data-testid="share-code-btn"
          >
            <Ionicons name="share-social" size={18} color="#2563EB" />
            <Text style={[styles.copyText, { color: '#2563EB' }]}>{ta(language, 'shareCode')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={[styles.regCodeHidden, { color: colors.textMuted }]}>
          {t('keyNotGeneratedYet')}
        </Text>
      )}
    </View>
    )}
    {/* Keep Generate Key button visible even when uninstall allowed */}
    {canAccessRegistrationCode ? (
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
    ) : (
      <View style={[styles.generateKeyButton, { backgroundColor: '#475569', opacity: 0.7 }]}>
        <Ionicons name="lock-closed" size={16} color="#94A3B8" />
        <Text style={[styles.generateKeyButtonText, { color: '#94A3B8' }]}>
          {language === 'et' ? 'Võti (Pro)' : 'Key (Pro)'}
        </Text>
      </View>
    )}
  </View>
);
};
