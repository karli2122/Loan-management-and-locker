import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import type { Client, LoanHistoryItem } from './types';

interface Props {
  client: Client;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  loanHistory: LoanHistoryItem[];
  onWarning: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onAllowUninstall: () => void;
  onNavigateAddLoan: (path: string) => void;
}

export const ActionButtons = ({
  client, language, t, actionLoading, loanHistory,
  onWarning, onLock, onUnlock, onAllowUninstall, onNavigateAddLoan,
}: Props) => {
  if (!client.is_registered) return null;

  return (
    <View style={styles.actionsSection}>
      <Text style={styles.sectionTitle}>{t('quickActions')}</Text>

      {!client.loan_start_date && (
        <>
          {loanHistory.length > 0 ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.renewLoanButton]}
              onPress={() => onNavigateAddLoan(`/admin/add-loan?clientId=${client.id}&renew=true`)}
              disabled={actionLoading}
              data-testid="renew-loan-btn"
            >
              <Ionicons name="refresh-circle" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>{t('renewLoan')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.setupLoanButton]}
              onPress={() => onNavigateAddLoan(`/admin/add-loan?clientId=${client.id}`)}
              disabled={actionLoading}
              data-testid="setup-loan-btn"
            >
              <Ionicons name="wallet" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>{t('setupLoan')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {client.admin_mode_active && (
        <>
          <TouchableOpacity
            style={[styles.actionButton, styles.warningButton]}
            onPress={onWarning}
            disabled={actionLoading}
            data-testid="send-warning-btn"
          >
            <Ionicons name="warning" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('sendWarning')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, client.is_locked ? styles.unlockButton : styles.lockButton]}
            onPress={client.is_locked ? onUnlock : onLock}
            disabled={actionLoading}
            data-testid="toggle-lock-btn"
          >
            <Ionicons name={client.is_locked ? 'lock-open' : 'lock-closed'} size={20} color="#fff" />
            <Text style={styles.actionButtonText}>
              {client.is_locked ? t('unlockDevice') : t('lockDevice')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.allowUninstallButton]}
            onPress={onAllowUninstall}
            disabled={actionLoading}
            data-testid="allow-uninstall-btn"
          >
            <Ionicons name="shield-checkmark" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Allow Uninstall</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};
