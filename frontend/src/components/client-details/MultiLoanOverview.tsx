import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCurrency } from '../../context/CurrencyContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import API_URL from '../../constants/api';

export const MultiLoanOverview = ({
  clientId,
  clientName,
  onRecordPayment,
  onAddNewLoan,
  onEditLoan,
  refreshKey,
  adminPlan,
}) => {
  const { formatAmount } = useCurrency();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchLoans = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) return;
      
      const resp = await fetch(
        `${API_URL}/api/loans/client/${clientId}?admin_token=${token}&status=all`
      );
      if (resp.ok) {
        const data = await resp.json();
        setLoans(data.loans || []);
        setSummary(data.summary || null);
      }
    } catch (e) {
      console.log('Error fetching loans:', e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Fetch loans on mount and when screen regains focus
  useFocusEffect(
    useCallback(() => {
      fetchLoans();
    }, [fetchLoans])
  );

  // Also refresh when refreshKey changes (e.g., after payment from parent)
  useEffect(() => {
    if (refreshKey) fetchLoans();
  }, [refreshKey]);

  // Calculate interest amount
  const getInterestAmount = (loan) => {
    if (loan.interest_amount) return loan.interest_amount;
    const principal = loan.loan_amount || 0;
    const total = loan.total_amount_due || loan.total_amount || principal;
    return total - principal;
  };

  // Calculate paid percentage
  const getPaidPercentage = (loan) => {
    const totalDue = loan.total_amount_due || loan.total_amount || loan.outstanding_balance || 0;
    if (!totalDue || totalDue === 0) return 0;
    return ((loan.total_paid || 0) / totalDue * 100).toFixed(1);
  };

  // Send payment link to client
  const handleSendPaymentLink = async (loanId: string, dueTodayAmount: number) => {
    const isEnterprise = adminPlan === 'enterprise' || adminPlan === 'custom';
    if (!isEnterprise) {
      Alert.alert('Enterprise Feature', 'Sending payment links requires the Enterprise or Custom plan.');
      return;
    }
    
    Alert.alert(
      'Send Payment Link',
      `Send a payment link of ${dueTodayAmount > 0 ? dueTodayAmount.toFixed(2) : '0.00'} EUR to ${clientName || 'client'}?\n\nThe client will receive an in-app message and push notification.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setActionLoading(loanId + '_pay');
            try {
              const token = await AsyncStorage.getItem('admin_token');
              const resp = await fetch(
                `${API_URL}/api/connect/send-payment-link?admin_token=${token}&client_id=${clientId}&loan_id=${loanId}&amount=${dueTodayAmount}`,
                { method: 'POST' }
              );
              const data = await resp.json();
              if (resp.ok && data.success) {
                Alert.alert(
                  'Payment Link Sent',
                  `Message sent to ${clientName}.\n${data.push_notification_sent ? 'Push notification delivered.' : 'Push notification not available.'}`
                );
              } else {
                Alert.alert('Error', data.detail || 'Failed to send payment link. Make sure Stripe Connect is set up in Settings.');
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to send payment link');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  // Delete a loan
  const handleDeleteLoan = async (loanId: string) => {
    Alert.alert(
      'Delete Loan',
      'Are you sure you want to delete this loan? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(loanId);
            try {
              const token = await AsyncStorage.getItem('admin_token');
              const resp = await fetch(
                `${API_URL}/api/loans/${loanId}?admin_token=${token}`,
                { method: 'DELETE' }
              );
              if (resp.ok) {
                Alert.alert('Success', 'Loan deleted successfully');
                fetchLoans();
              } else {
                const err = await resp.json().catch(() => ({}));
                Alert.alert('Error', err.detail || 'Failed to delete loan');
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to delete loan');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  // Share contract - download PDF and open native share dialog
  const handleShareContract = async (loanId: string) => {
    setActionLoading(loanId);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const url = `${API_URL}/api/contracts/loan/${loanId}/download?admin_token=${token}&language=en`;
      
      // Download PDF to local file system
      const fileName = `loan_contract_${loanId.substring(0, 8)}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      const downloadResult = await FileSystem.downloadAsync(url, fileUri);
      
      if (downloadResult.status === 200) {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Loan Contract - ${clientName || 'Client'}`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          // Fallback: open URL directly
          await Linking.openURL(`${API_URL}/api/contracts/loan/${loanId}/download?admin_token=${token}&language=en`);
        }
      } else {
        Alert.alert('Error', 'Failed to download contract');
      }
    } catch (e: any) {
      // Fallback to opening URL directly
      try {
        const token = await AsyncStorage.getItem('admin_token');
        await Linking.openURL(`${API_URL}/api/contracts/loan/${loanId}/download?admin_token=${token}&language=en`);
      } catch {
        Alert.alert('Error', 'Failed to share contract');
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const activeLoans = loans.filter(l => l.status === 'active');
  const archivedLoans = loans.filter(l => l.status === 'archived');

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('loanOverview') || 'Loan Overview'}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={onAddNewLoan}
          data-testid="add-new-loan-btn"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>New Loan</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      {summary && activeLoans.length > 0 && (
        <View style={[styles.summaryCard, { backgroundColor: colors.background }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Active Loans</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{summary.active_loans}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Outstanding</Text>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{formatAmount(summary.total_outstanding)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Active Loans */}
      {activeLoans.length > 0 ? (
        <View style={styles.loansSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            <Ionicons name="cash" size={16} color="#10B981" /> Active Loans ({activeLoans.length})
          </Text>
          {activeLoans.map((loan, index) => (
            <View key={loan.id} style={[styles.loanCard, { backgroundColor: colors.background }]}>
              <View style={styles.loanHeader}>
                <View style={styles.loanBadge}>
                  <Text style={styles.loanBadgeText}>Loan #{index + 1}</Text>
                </View>
                {loan.imported_from_statement && (
                  <View style={[styles.importedBadge, { backgroundColor: '#8B5CF6' }]}>
                    <Text style={styles.importedBadgeText}>IMPORTED</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.editBtn, { backgroundColor: colors.primary }]}
                  onPress={() => onEditLoan && onEditLoan(loan.id, loan)}
                  data-testid={`edit-loan-btn-${loan.id}`}
                >
                  <Ionicons name="pencil" size={14} color="#fff" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.loanDetails}>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Given Amount</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{formatAmount(loan.loan_amount)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Interest Amount</Text>
                  <Text style={[styles.loanValue, { color: '#F59E0B' }]}>{formatAmount(getInterestAmount(loan))}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Given Date</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{loan.given_date || loan.loan_given_date || '-'}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Due Date</Text>
                  <Text style={[styles.loanValue, { color: '#EF4444' }]}>{loan.due_date || '-'}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Paid Amount</Text>
                  <Text style={[styles.loanValue, { color: '#10B981' }]}>{formatAmount(loan.total_paid || 0)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Due Today</Text>
                  <Text style={[styles.loanValue, { color: (loan.due_today_amount || 0) > 0 ? '#EF4444' : colors.textMuted }]}>
                    {(loan.due_today_amount || 0) > 0 ? formatAmount(loan.due_today_amount) : '-'}
                  </Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Outstanding</Text>
                  <Text style={[styles.loanValue, { color: '#EF4444' }]}>
                    {formatAmount(loan.outstanding_balance || 0)}
                  </Text>
                </View>
              </View>

              {/* Progress Bar with Paid % */}
              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressLabel, { color: colors.textMuted }]}>Payment Progress</Text>
                  <Text style={[styles.progressPercent, { color: '#10B981' }]}>{getPaidPercentage(loan)}% Paid</Text>
                </View>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${Math.min(parseFloat(getPaidPercentage(loan)), 100)}%` }
                    ]} 
                  />
                </View>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                  onPress={() => onRecordPayment(loan.id, loan, loan.due_today_amount || 0)}
                  data-testid={`record-payment-btn-${loan.id}`}
                >
                  <Ionicons name="card" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Payment</Text>
                </TouchableOpacity>
                {(adminPlan === 'enterprise' || adminPlan === 'custom') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                    onPress={() => handleSendPaymentLink(loan.id, loan.due_today_amount || 0)}
                    disabled={actionLoading === loan.id + '_pay'}
                    data-testid={`send-payment-link-btn-${loan.id}`}
                  >
                    {actionLoading === loan.id + '_pay' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="send" size={14} color="#fff" />
                        <Text style={styles.actionBtnText}>Pay Link</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                  onPress={() => handleShareContract(loan.id)}
                  disabled={actionLoading === loan.id}
                  data-testid={`share-contract-btn-${loan.id}`}
                >
                  {actionLoading === loan.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Contract</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => handleDeleteLoan(loan.id)}
                  disabled={actionLoading === loan.id}
                  data-testid={`delete-loan-btn-${loan.id}`}
                >
                  <Ionicons name="trash" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyState, { backgroundColor: colors.background }]}>
          <Ionicons name="checkmark-circle" size={48} color="#10B981" />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Loans</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            This client has no outstanding loans
          </Text>
        </View>
      )}

      {/* Archived Loans (Loan History) */}
      {archivedLoans.length > 0 && (
        <View style={styles.loansSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            <Ionicons name="time" size={16} color="#6B7280" /> Loan History ({archivedLoans.length})
          </Text>
          {archivedLoans.map((loan, index) => (
            <View key={loan.id} style={[styles.loanCard, styles.archivedCard, { backgroundColor: colors.background }]}>
              <View style={styles.loanHeader}>
                <View style={[styles.loanBadge, { backgroundColor: '#6B7280' }]}>
                  <Text style={styles.loanBadgeText}>Archived</Text>
                </View>
                <View style={[styles.paidBadge, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.paidBadgeText}>PAID</Text>
                </View>
              </View>
              
              <View style={styles.loanDetails}>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Amount</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{formatAmount(loan.loan_amount)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Total Paid</Text>
                  <Text style={[styles.loanValue, { color: '#10B981' }]}>{formatAmount(loan.total_paid || loan.total_amount_due || loan.total_amount)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Given Date</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{loan.given_date || loan.loan_given_date || '-'}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Due Date</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{loan.due_date || '-'}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  loansSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  loanCard: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  archivedCard: {
    opacity: 0.8,
  },
  loanHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  loanBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  loanBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  importedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  importedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
    marginLeft: 'auto',
  },
  editBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  paidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  paidBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  loanDetails: {
    gap: 8,
  },
  loanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loanLabel: {
    fontSize: 13,
  },
  loanValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
    minWidth: 70,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    padding: 32,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
});

export default MultiLoanOverview;
