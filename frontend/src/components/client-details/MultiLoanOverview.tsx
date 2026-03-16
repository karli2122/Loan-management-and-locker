import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCurrency } from '../../context/CurrencyContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../constants/api';

export const MultiLoanOverview = ({
  clientId,
  clientName,
  onRecordPayment,
  onAddNewLoan,
}) => {
  const { formatAmount } = useCurrency();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

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
              </View>
              
              <View style={styles.loanDetails}>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Given</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{formatAmount(loan.loan_amount)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>With Interest</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{formatAmount(loan.total_amount_due)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Paid</Text>
                  <Text style={[styles.loanValue, { color: '#10B981' }]}>{formatAmount(loan.total_paid || 0)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Outstanding</Text>
                  <Text style={[styles.loanValue, { color: '#EF4444', fontWeight: '700' }]}>{formatAmount(loan.outstanding_balance)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Date Given</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{loan.loan_given_date || '-'}</Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${loan.total_amount_due > 0 ? ((loan.total_paid || 0) / loan.total_amount_due * 100) : 0}%` }
                    ]} 
                  />
                </View>
                <Text style={[styles.progressText, { color: colors.textMuted }]}>
                  {loan.total_amount_due > 0 ? ((loan.total_paid || 0) / loan.total_amount_due * 100).toFixed(0) : 0}% paid
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.paymentBtn, { backgroundColor: '#10B981' }]}
                onPress={() => onRecordPayment(loan.id, loan)}
                data-testid={`record-payment-btn-${loan.id}`}
              >
                <Ionicons name="card" size={16} color="#fff" />
                <Text style={styles.paymentBtnText}>Record Payment</Text>
              </TouchableOpacity>
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
                  <Text style={[styles.loanValue, { color: '#10B981' }]}>{formatAmount(loan.total_paid || loan.total_amount_due)}</Text>
                </View>
                <View style={styles.loanRow}>
                  <Text style={[styles.loanLabel, { color: colors.textMuted }]}>Date</Text>
                  <Text style={[styles.loanValue, { color: colors.text }]}>{loan.loan_given_date || '-'}</Text>
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
  },
  loanLabel: {
    fontSize: 13,
  },
  loanValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressContainer: {
    marginTop: 12,
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  paymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  paymentBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
});

export default MultiLoanOverview;
