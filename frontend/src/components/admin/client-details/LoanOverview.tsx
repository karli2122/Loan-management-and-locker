import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import type { Client } from './types';

interface Props {
  client: Client;
  language: string;
  id: string | string[];
  actionLoading: boolean;
  onEditLoan: () => void;
  onRecordPayment: () => void;
  onDownloadContract: () => void;
  onShareContract: () => void;
  onNavigateAddLoan: (path: string) => void;
}

export const LoanOverview = ({
  client, language, id, actionLoading, onEditLoan, onRecordPayment,
  onDownloadContract, onShareContract, onNavigateAddLoan,
}: Props) => {
  if (!client.loan_start_date) return null;

  const paidPercent = client.total_amount_due
    ? ((client.total_paid || 0) / client.total_amount_due * 100)
    : 0;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{language === 'et' ? 'Laenu ülevaade' : 'Loan Overview'}</Text>
        <View style={styles.loanHeaderButtons}>
          {(client.outstanding_balance || 0) <= 0 ? (
            <TouchableOpacity
              style={styles.addNewLoanBtn}
              onPress={() => onNavigateAddLoan(`/admin/add-loan?client_id=${id}`)}
              data-testid="add-new-loan-btn"
            >
              <Ionicons name="add-circle" size={16} color="#10B981" />
              <Text style={styles.addNewLoanBtnText}>{language === 'et' ? 'Lisa uus laen' : 'Add New Loan'}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.editLoanBtn} onPress={onEditLoan} data-testid="edit-loan-btn">
                <Ionicons name="create-outline" size={16} color="#4F46E5" />
                <Text style={styles.editLoanBtnText}>{language === 'et' ? 'Muuda' : 'Edit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recordPaymentBtn} onPress={onRecordPayment}>
                <Ionicons name="card" size={16} color="#10B981" />
                <Text style={styles.recordPaymentBtnText}>{language === 'et' ? 'Lisa makse' : 'Record Payment'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Loan Progress */}
      <View style={styles.loanProgressCard}>
        <View style={styles.loanProgressBar}>
          <View style={[styles.loanProgressFill, { width: `${paidPercent}%` }]} />
        </View>
        <Text style={styles.loanProgressText}>{paidPercent.toFixed(1)}% {language === 'et' ? 'makstud' : 'paid'}</Text>
      </View>

      <View style={styles.loanStatsGrid}>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{language === 'et' ? 'Laen antud' : 'Amount Given'}</Text>
          <Text style={styles.loanStatValue}>{'\u20AC'}{(client.loan_amount || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{language === 'et' ? 'Tagasimakse intressiga' : 'Amount Due (with Interest)'}</Text>
          <Text style={[styles.loanStatValue, { color: '#EF4444' }]}>{'\u20AC'}{(() => {
            const loanAmt = client.loan_amount || 0;
            const rate = client.interest_rate || 0;
            const totalDue = client.total_amount_due || 0;
            if (totalDue > loanAmt) return totalDue.toFixed(2);
            if (loanAmt > 0 && rate > 0) return (loanAmt + loanAmt * rate / 100).toFixed(2);
            return loanAmt.toFixed(2);
          })()}</Text>
        </View>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{language === 'et' ? 'Makstud' : 'Paid'}</Text>
          <Text style={[styles.loanStatValue, { color: '#10B981' }]}>{'\u20AC'}{(client.total_paid || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.loanStatItem}>
          <Text style={styles.loanStatLabel}>{language === 'et' ? 'Tähtaeg' : 'Due Date'}</Text>
          <Text style={styles.loanStatValue}>{client.next_payment_due || client.loan_due_date || (language === 'et' ? 'Määramata' : 'Not set')}</Text>
        </View>
      </View>

      {(client.days_overdue || 0) > 0 && (
        <View style={styles.overdueAlert}>
          <Ionicons name="warning" size={20} color="#EF4444" />
          <Text style={styles.overdueAlertText}>
            {client.days_overdue} {language === 'et' ? 'päeva üle tähtaja' : 'days overdue'}
          </Text>
        </View>
      )}

      {/* Late Fee Information */}
      {(client.is_late || (client.late_fees_accumulated || 0) > 0) && (
        <View style={styles.lateFeeCard}>
          <View style={styles.lateFeeHeader}>
            <Ionicons name="cash-outline" size={20} color="#DC2626" />
            <Text style={styles.lateFeeTitle}>{language === 'et' ? 'Viivis' : 'Late Fee'}</Text>
          </View>
          <View style={styles.lateFeeDetails}>
            <View style={styles.lateFeeDetailItem}>
              <Text style={styles.lateFeeLabel}>{language === 'et' ? 'Viivise summa' : 'Late Fee Amount'}</Text>
              <Text style={styles.lateFeeValue}>{'\u20AC'}{(client.late_fees_accumulated || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.lateFeeDetailItem}>
              <Text style={styles.lateFeeLabel}>{language === 'et' ? 'Kokku maksta' : 'Total Due'}</Text>
              <Text style={styles.lateFeeValueTotal}>
                {'\u20AC'}{((client.outstanding_balance || 0) + (client.late_fees_accumulated || 0)).toFixed(2)}
              </Text>
            </View>
          </View>
          {client.auto_lock_enabled && (client.days_overdue || 0) > 0 && (
            <View style={styles.autoLockWarning}>
              <Ionicons name="lock-closed" size={14} color="#F59E0B" />
              <Text style={styles.autoLockWarningText}>
                {language === 'et'
                  ? `Automaatne lukustus ${client.auto_lock_grace_days || 3} päeva pärast tähtaega`
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
            {language === 'et' ? 'Laadi alla' : 'Download'}
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
            {language === 'et' ? 'Jaga' : 'Share'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
