import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import type { LoanHistoryItem } from './types';

interface Props {
  colors: any;
  language: string;
  showLoanHistory: boolean;
  loanHistory: LoanHistoryItem[];
  loanHistoryLoading: boolean;
  loanHistorySearch: string;
  onToggle: () => void;
  onSearchChange: (text: string) => void;
}

export const LoanHistory = ({
  colors, language, showLoanHistory, loanHistory, loanHistoryLoading,
  loanHistorySearch, onToggle, onSearchChange,
}: Props) => (
  <View style={[styles.section, { backgroundColor: colors.surface }]}>
    <TouchableOpacity style={styles.loanHistoryHeader} onPress={onToggle} data-testid="loan-history-toggle">
      <View style={styles.loanHistoryHeaderLeft}>
        <Ionicons name="time" size={20} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
          {t('loanHistory')}
        </Text>
      </View>
      <Ionicons name={showLoanHistory ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
    </TouchableOpacity>

    {showLoanHistory && (
      <View style={styles.loanHistoryContent}>
        {loanHistory.length > 0 && (
          <View style={[styles.loanHistorySearchContainer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.loanHistorySearchInput, { color: colors.text }]}
              placeholder={t('searchByAmountDateInterest')}
              placeholderTextColor={colors.textMuted}
              value={loanHistorySearch}
              onChangeText={onSearchChange}
              data-testid="loan-history-search-input"
            />
            {loanHistorySearch.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')} data-testid="loan-history-search-clear">
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loanHistoryLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
        ) : loanHistory.length === 0 ? (
          <View style={styles.emptyLoanHistory}>
            <Ionicons name="document-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyLoanHistoryText, { color: colors.textMuted }]}>
              {t('noArchivedLoans')}
            </Text>
          </View>
        ) : (
          (() => {
            const query = loanHistorySearch.toLowerCase().trim();
            const filtered = query
              ? loanHistory.filter((loan) => {
                  const searchable = `\u20AC${loan.loan_amount?.toFixed(2) || '0'} \u20AC${loan.total_paid?.toFixed(2) || '0'} ${loan.interest_rate?.toFixed(1) || '0'}% \u20AC${loan.total_interest?.toFixed(2) || '0'} ${loan.archived_at ? new Date(loan.archived_at).toLocaleDateString('et-EE') : ''}`.toLowerCase();
                  return searchable.includes(query);
                })
              : loanHistory;

            if (filtered.length === 0) {
              return (
                <View style={styles.emptyLoanHistory}>
                  <Ionicons name="search-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.emptyLoanHistoryText, { color: colors.textMuted }]}>
                    {t('noResultsFound')}
                  </Text>
                </View>
              );
            }

            return filtered.map((loan, index) => (
              <View
                key={loan.id}
                style={[
                  styles.loanHistoryCard,
                  { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                  index < loanHistory.length - 1 && { marginBottom: 12 },
                ]}
              >
                <View style={styles.loanHistoryCardHeader}>
                  <View style={styles.loanHistoryBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={[styles.loanHistoryBadgeText, { color: colors.success }]}>
                      {t('paid')}
                    </Text>
                  </View>
                  <Text style={[styles.loanHistoryDate, { color: colors.textMuted }]}>
                    {loan.archived_at ? new Date(loan.archived_at).toLocaleDateString('et-EE') : ''}
                  </Text>
                </View>
                <View style={styles.loanHistoryDetails}>
                  {[
                    { label: t('emiAmount'), value: `\u20AC${loan.loan_amount?.toFixed(2) || '0.00'}`, color: colors.text },
                    { label: t('interestMonthly'), value: `${loan.interest_rate?.toFixed(1) || '0'}%`, color: colors.text },
                    { label: t('totalPaid'), value: `\u20AC${loan.total_paid?.toFixed(2) || '0.00'}`, color: colors.success },
                    { label: t('interestEarned'), value: `\u20AC${loan.total_interest?.toFixed(2) || '0.00'}`, color: colors.primary },
                    { label: t('payments'), value: `${loan.payment_count || 0}`, color: colors.text },
                  ].map((row) => (
                    <View key={row.label} style={styles.loanHistoryDetailRow}>
                      <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>{row.label}</Text>
                      <Text style={[styles.loanHistoryValue, { color: row.color }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ));
          })()
        )}
      </View>
    )}
  </View>
);
