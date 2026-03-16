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
  canAccessContracts?: boolean;
}

export const LoanOverview = ({
  client, language, clientId, actionLoading,
  onEditLoan, onRecordPayment, onAddNewLoan,
  onDownloadContract, onShareContract,
  canAccessContracts = true,
}: Props) => {
  const { formatAmount } = useCurrency();
  const { t } = useLanguage();
  if (!client.loan_start_date) return null;

  // Calculate amount remaining with interest
  const loanAmt = client.loan_amount || 0;
  const rate = client.interest_rate || 0;
  const totalDue = client.total_amount_due || (loanAmt + loanAmt * rate / 100);
  const outstanding = client.outstanding_balance || 0;
  const totalPaid = client.total_paid || 0;
  const isFullyPaid = outstanding <= 0 && loanAmt > 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('loanOverview')}</Text>
        <View style={styles.loanHeaderButtons}>
          {isFullyPaid ? (
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

      {isFullyPaid ? (
        /* Loan Completed State */
        <View style={[styles.loanProgressCard, { backgroundColor: '#10B98115', borderColor: '#10B981', borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
            <Ionicons name="checkmark-circle" size={28} color="#10B981" />
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#10B981' }}>
                {language === 'et' ? 'Laen tagasi makstud' : 'Loan Fully Paid'}
              </Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                {language === 'et' ? 'Vaata laenu ajalugu allpool' : 'View loan history below'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Loan Progress */}
          <View style={styles.loanProgressCard}>
            <View style={styles.loanProgressBar}>
              <View
                style={[
                  styles.loanProgressFill,
                  { width: `${totalDue > 0 ? (totalPaid / totalDue * 100) : 0}%` },
                ]}
              />
            </View>
            <Text style={styles.loanProgressText}>
              {totalDue > 0 ? (totalPaid / totalDue * 100).toFixed(1) : 0}% {t('paid2')}
            </Text>
          </View>

          <View style={styles.loanStatsGrid}>
            <View style={styles.loanStatItem}>
              <Text style={styles.loanStatLabel}>{t('amountGiven')}</Text>
              <Text style={styles.loanStatValue}>{formatAmount(loanAmt)}</Text>
            </View>
            <View style={styles.loanStatItem}>
              <Text style={styles.loanStatLabel}>{t('amountDueWithInterest')}</Text>
              <Text style={[styles.loanStatValue, { color: '#EF4444' }]}>{formatAmount(totalDue)}</Text>
            </View>
            <View style={styles.loanStatItem}>
              <Text style={styles.loanStatLabel}>{t('paid')}</Text>
              <Text style={[styles.loanStatValue, { color: '#10B981' }]}>{formatAmount(totalPaid)}</Text>
            </View>
            <View style={styles.loanStatItem}>
              <Text style={styles.loanStatLabel}>{language === 'et' ? 'J\u00e4\u00e4nud maksta' : 'Remaining'}</Text>
              <Text style={[styles.loanStatValue, { color: '#F59E0B' }]}>{formatAmount(outstanding)}</Text>
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
                    {formatAmount(outstanding + (client.late_fees_accumulated || 0))}
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
        </>
      )}

      {/* Contract Actions */}
      {canAccessContracts ? (
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
      ) : (
        <View style={[styles.contractActions, { opacity: 0.6 }]}>
          <View style={[styles.contractButton, { backgroundColor: '#334155' }]}>
            <Ionicons name="lock-closed" size={16} color="#64748B" />
            <Text style={[styles.contractButtonText, { color: '#64748B' }]}>
              {language === 'et' ? 'Leping (Pro)' : 'Contract (Pro)'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};
