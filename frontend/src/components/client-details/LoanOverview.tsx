import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { Client } from './types';
import { useCurrency } from '../../context/CurrencyContext';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  client: Client;
  language: string;
  clientId: string;
  actionLoading: boolean;
  onEditLoan: () => void;
  onRecordPayment: () => void;
  onAddNewLoan: () => void;
  onDownloadContract: () => void;
  onShareContract: () => void;
}

export const LoanOverview = ({
  client, language, clientId, actionLoading,
  onEditLoan, onRecordPayment, onAddNewLoan,
  onDownloadContract, onShareContract,
}: Props) => {
  const { formatAmount } = useCurrency();
  const { t } = useLanguage();
  if (!client.loan_start_date) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('loanOverview')}</Text>
        <View style={styles.loanHeaderButtons}>
          {(client.outstanding_balance || 0) <= 0 ? (
            <TouchableOpacity
              style={styles.addNewLoanBtn}
              onPress={onAddNewLoan}
              data-testid="add-new-loan-btn"
            >
              <Ionicons name="add-circle" size={16} color="#10B981" />
              <Text style={styles.addNewLoanBtnText}>{t('addNewLoan')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.editLoanBtn} onPress={onEditLoan} data-testid="edit-loan-btn">
                <Ionicons name="create-outline" size={16} color="#2563EB" />
                <Text style={styles.editLoanBtnText}>{t('edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recordPaymentBtn} onPress={onRecordPayment}>
                <Ionicons name="card" size={16} color="#10B981" />
                <Text style={styles.recordPaymentBtnText}>{t('recordPayment')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Loan Progress */}
      <View style={styles.loanProgressCard}>
        <View style={styles.loanProgressBar}>
          <View
            style={[
              styles.loanProgressFill,
              { width: `${client.total_amount_due ? (client.total_paid || 0) / client.total_amount_due * 100 : 0}%` },
            ]}
          />
        </View>
        <Text style={styles.loanProgressText}>
          {client.total_amount_due ? ((client.total_paid || 0) / client.total_amount_due * 100).toFixed(1) : 0}% {t('paid2')}
        </Text>
      </View>

      <View style={styles.loanStatsGrid}>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{t('amountGiven')}</Text>
          <Text style={styles.loanStatValue}>{formatAmount(client.loan_amount || 0)}</Text>
        </View>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{t('amountDueWithInterest')}</Text>
          <Text style={[styles.loanStatValue, { color: '#EF4444' }]}>{formatAmount((() => {
            const loanAmt = client.loan_amount || 0;
            const rate = client.interest_rate || 0;
            const totalDue = client.total_amount_due || 0;
            if (totalDue > loanAmt) return totalDue;
            if (loanAmt > 0 && rate > 0) return loanAmt + loanAmt * rate / 100;
            return loanAmt;
          })())}</Text>
        </View>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{t('paid')}</Text>
          <Text style={[styles.loanStatValue, { color: '#10B981' }]}>{formatAmount(client.total_paid || 0)}</Text>
        </View>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{t('dueDate')}</Text>
          <Text style={styles.loanStatValue}>{client.next_payment_due || client.loan_due_date || (t('notSet'))}</Text>
        </View>
      </View>

      {(client.days_overdue || 0) > 0 && (
        <View style={styles.overdueAlert}>
          <Ionicons name="warning" size={20} color="#EF4444" />
          <Text style={styles.overdueAlertText}>
            {client.days_overdue} {t('daysOverdue')}
          </Text>
        </View>
      )}

      {/* Late Fee Information */}
      {(client.is_late || (client.late_fees_accumulated || 0) > 0) && (
        <View style={styles.lateFeeCard}>
          <View style={styles.lateFeeHeader}>
            <Ionicons name="cash-outline" size={20} color="#DC2626" />
            <Text style={styles.lateFeeTitle}>{t('lateFee')}</Text>
          </View>
          <View style={styles.lateFeeDetails}>
            <View style={styles.lateFeeDetailItem}>
              <Text style={styles.lateFeeLabel}>{t('lateFeeAmount')}</Text>
              <Text style={styles.lateFeeValue}>{formatAmount(client.late_fees_accumulated || 0)}</Text>
            </View>
            <View style={styles.lateFeeDetailItem}>
              <Text style={styles.lateFeeLabel}>{t('totalDue')}</Text>
              <Text style={styles.lateFeeValueTotal}>
                {formatAmount((client.outstanding_balance || 0) + (client.late_fees_accumulated || 0))}
              </Text>
            </View>
          </View>
          {client.auto_lock_enabled && (client.days_overdue || 0) > 0 && (
            <View style={styles.autoLockWarning}>
              <Ionicons name="lock-closed" size={14} color="#F59E0B" />
              <Text style={styles.autoLockWarningText}>
                {language === 'et'
                  ? `Automaatne lukustus ${client.auto_lock_grace_days || 3} p\u00e4eva p\u00e4rast t\u00e4htaega`
                  : `Auto-lock after ${client.auto_lock_grace_days || 3} days overdue`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Contract Actions */}
      <View style={styles.contractActions}>
        <TouchableOpacity
          style={[styles.contractButton, styles.downloadButton]}
          onPress={onDownloadContract}
          disabled={actionLoading}
          data-testid="download-contract-btn"
        >
          <Ionicons name="download" size={16} color="#3B82F6" />
          <Text style={[styles.contractButtonText, styles.downloadButtonText]}>
            {t('download')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.contractButton, styles.shareButton]}
          onPress={onShareContract}
          disabled={actionLoading}
          data-testid="share-contract-btn"
        >
          <Ionicons name="share-social" size={16} color="#10B981" />
          <Text style={[styles.contractButtonText, styles.shareButtonText]}>
            {t('share')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
