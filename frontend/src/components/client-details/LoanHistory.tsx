import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { LoanHistoryItem } from './types';
import { useCurrency } from '../../context/CurrencyContext';

interface Props {
  loanHistory: LoanHistoryItem[];
  loanHistoryLoading: boolean;
  showLoanHistory: boolean;
  loanHistorySearch: string;
  language: string;
  colors: any;
  onToggle: () => void;
  onSearchChange: (text: string) => void;
}

export const LoanHistory = ({
  loanHistory, loanHistoryLoading, showLoanHistory,
  loanHistorySearch, language, colors, onToggle, onSearchChange,
}: Props) => (
  <View style={[styles.section, { backgroundColor: colors.surface }]}>
    <TouchableOpacity
      style={styles.loanHistoryHeader}
      onPress={onToggle}
      data-testid="loan-history-toggle"
    >
      <View style={styles.loanHistoryHeaderLeft}>
        <Ionicons name="time" size={20} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
          {language === 'et' ? 'Laenu ajalugu' : 'Loan History'}
        </Text>
      </View>
      <Ionicons
        name={showLoanHistory ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={colors.textMuted}
      />
    </TouchableOpacity>

    {showLoanHistory && (
      <View style={styles.loanHistoryContent}>
        {loanHistory.length > 0 && (
          <View style={[styles.loanHistorySearchContainer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.loanHistorySearchInput, { color: colors.text }]}
              placeholder={language === 'et' ? 'Otsi summa, kuup\u00e4eva, intressi j\u00e4rgi...' : 'Search by amount, date, interest...'}
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
              {language === 'et' ? 'Arhiveeritud laene pole' : 'No archived loans'}
            </Text>
          </View>
        ) : (
          <LoanHistoryList
            loanHistory={loanHistory}
            loanHistorySearch={loanHistorySearch}
            language={language}
            colors={colors}
          />
        )}
      </View>
    )}
  </View>
);

const LoanHistoryList = ({
  loanHistory, loanHistorySearch, language, colors,
}: {
  loanHistory: LoanHistoryItem[];
  loanHistorySearch: string;
  language: string;
  colors: any;
}) => {
  const { formatAmount } = useCurrency();
  const query = loanHistorySearch.toLowerCase().trim();
  const filtered = query
    ? loanHistory.filter((loan) => {
        const amount = formatAmount(loan.loan_amount || 0);
        const paid = formatAmount(loan.total_paid || 0);
        const interest = `${loan.interest_rate?.toFixed(1) || '0'}%`;
        const interestEarned = formatAmount(loan.total_interest || 0);
        const date = loan.archived_at ? new Date(loan.archived_at).toLocaleDateString('et-EE') : '';
        const searchable = `${amount} ${paid} ${interest} ${interestEarned} ${date}`.toLowerCase();
        return searchable.includes(query);
      })
    : loanHistory;

  if (filtered.length === 0) {
    return (
      <View style={styles.emptyLoanHistory}>
        <Ionicons name="search-outline" size={32} color={colors.textMuted} />
        <Text style={[styles.emptyLoanHistoryText, { color: colors.textMuted }]}>
          {language === 'et' ? 'Tulemusi ei leitud' : 'No results found'}
        </Text>
      </View>
    );
  }

  return (
    <>
      {filtered.map((loan, index) => (
        <View
          key={loan.id}
          style={[
            styles.loanHistoryCard,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            index < filtered.length - 1 && { marginBottom: 12 },
          ]}
        >
          <View style={styles.loanHistoryCardHeader}>
            <View style={styles.loanHistoryBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={[styles.loanHistoryBadgeText, { color: colors.success }]}>
                {language === 'et' ? 'Tasutud' : 'Paid'}
              </Text>
            </View>
            <Text style={[styles.loanHistoryDate, { color: colors.textMuted }]}>
              {loan.archived_at ? new Date(loan.archived_at).toLocaleDateString('et-EE') : ''}
            </Text>
          </View>
          <View style={styles.loanHistoryDetails}>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Laenusumma' : 'Loan Amount'}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.text }]}>
                {formatAmount(loan.loan_amount || 0)}
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Intress (kuus)' : 'Interest (Monthly)'}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.text }]}>
                {loan.interest_rate?.toFixed(1) || '0'}%
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Makstud kokku' : 'Total Paid'}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.success }]}>
                {formatAmount(loan.total_paid || 0)}
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Intressitulu' : 'Interest Earned'}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.primary }]}>
                {formatAmount(loan.total_interest || 0)}
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Makseid' : 'Payments'}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.text }]}>
                {loan.payment_count || 0}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </>
  );
};
