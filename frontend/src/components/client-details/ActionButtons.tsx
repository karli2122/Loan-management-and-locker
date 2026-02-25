import React from 'react';
import { View, Text, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from './styles';
import { Client, LoanHistoryItem } from './types';
import API_URL from '../../constants/api';

interface Props {
  client: Client;
  loanHistory: LoanHistoryItem[];
  language: string;
  actionLoading: boolean;
  t: (key: string) => string;
  onSetupLoan: () => void;
  onRenewLoan: () => void;
  onSendWarning: () => void;
  onToggleLock: () => void;
  onAllowUninstall: () => void;
}

export const ActionButtons = ({
  client, loanHistory, language, actionLoading, t,
  onSetupLoan, onRenewLoan, onSendWarning, onToggleLock, onAllowUninstall,
}: Props) => {
  if (!client.is_registered) return null;

  const sendEmailReminder = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) return;
      const resp = await fetch(`${API_URL}/api/reminders/send-email/${client.id}?admin_token=${token}`, { method: 'POST' });
      const data = await resp.json();
      Alert.alert(data.success ? (language === 'et' ? 'Saadetud' : 'Sent') : (language === 'et' ? 'Viga' : 'Error'), data.message);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const sendWhatsAppReminder = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) return;
      const resp = await fetch(`${API_URL}/api/reminders/whatsapp-link/${client.id}?admin_token=${token}`);
      const data = await resp.json();
      if (data.deep_link) {
        Linking.openURL(data.deep_link);
      } else {
        Alert.alert('Error', data.message || 'No phone number');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <View style={styles.actionsSection}>
      <Text style={styles.sectionTitle}>{t('quickActions')}</Text>

      {/* Reminder Buttons */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {client.email && (
          <TouchableOpacity
            style={[styles.actionButton, { flex: 1, backgroundColor: '#2563EB' }]}
            onPress={sendEmailReminder}
            disabled={actionLoading}
            data-testid="send-email-reminder-btn"
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>{language === 'et' ? 'E-post' : 'Email'}</Text>
          </TouchableOpacity>
        )}
        {(client.phone || (client as any).phone_number) && (
          <TouchableOpacity
            style={[styles.actionButton, { flex: 1, backgroundColor: '#25D366' }]}
            onPress={sendWhatsAppReminder}
            disabled={actionLoading}
            data-testid="send-whatsapp-reminder-btn"
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>WhatsApp</Text>
          </TouchableOpacity>
        )}
      </View>

      {!client.loan_start_date && (
        <>
          {loanHistory.length > 0 ? (
            <TouchableOpacity
              style={[styles.actionButton, styles.renewLoanButton]}
              onPress={onRenewLoan}
              disabled={actionLoading}
              data-testid="renew-loan-btn"
            >
              <Ionicons name="refresh-circle" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>{t('renewLoan')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.setupLoanButton]}
              onPress={onSetupLoan}
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
            onPress={onSendWarning}
            disabled={actionLoading}
            data-testid="send-warning-btn"
          >
            <Ionicons name="warning" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>{t('sendWarning')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, client.is_locked ? styles.unlockButton : styles.lockButton]}
            onPress={onToggleLock}
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
