import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { LoanHistoryItem } from './types';
import { useCurrency } from '../../context/CurrencyContext';
import { useLanguage } from '../../context/LanguageContext';

const ITEMS_PER_PAGE = 5;

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
}: Props) => {
  const { t } = useLanguage();
  return (
  <View style={[styles.section, { backgroundColor: colors.surface }]}>
    <TouchableOpacity
      style={styles.loanHistoryHeader}
      onPress={onToggle}
      data-testid="loan-history-toggle"
    >
      <View style={styles.loanHistoryHeaderLeft}>
        <Ionicons name="time" size={20} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
          {t('loanHistory')}
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
};

const LoanHistoryList = ({
  loanHistory, loanHistorySearch, language, colors,
}: {
  loanHistory: LoanHistoryItem[];
  loanHistorySearch: string;
  language: string;
  colors: any;
}) => {
  const { formatAmount } = useCurrency();
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const query = loanHistorySearch.toLowerCase().trim();

  // Filter
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

  // Sort by most recent (archived_at descending)
  const sorted = [...filtered].sort((a, b) => {
    const dateA = a.archived_at ? new Date(a.archived_at).getTime() : 0;
    const dateB = b.archived_at ? new Date(b.archived_at).getTime() : 0;
    return dateB - dateA;
  });

  // Paginate
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageItems = sorted.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

  // Reset page when search changes
  React.useEffect(() => { setPage(0); }, [loanHistorySearch]);

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

  return (
    <>
      {pageItems.map((loan, index) => (
        <View
          key={loan.id}
          style={[
            styles.loanHistoryCard,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            index < pageItems.length - 1 && { marginBottom: 12 },
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
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {t('emiAmount')}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.text }]}>
                {formatAmount(loan.loan_amount || 0)}
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {t('interestMonthly')}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.text }]}>
                {loan.interest_rate?.toFixed(1) || '0'}%
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {t('totalPaid')}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.success }]}>
                {formatAmount(loan.total_paid || 0)}
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {t('interestEarned')}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.primary }]}>
                {formatAmount(loan.total_interest || 0)}
              </Text>
            </View>
            <View style={styles.loanHistoryDetailRow}>
              <Text style={[styles.loanHistoryLabel, { color: colors.textMuted }]}>
                {t('payments')}
              </Text>
              <Text style={[styles.loanHistoryValue, { color: colors.text }]}>
                {loan.payment_count || 0}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {totalPages > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 12 }}>
          <TouchableOpacity
            onPress={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            style={{ padding: 8, borderRadius: 8, backgroundColor: safePage === 0 ? colors.surfaceAlt : colors.primary, opacity: safePage === 0 ? 0.4 : 1 }}
            data-testid="loan-history-page-prev"
          >
            <Ionicons name="chevron-back" size={18} color={safePage === 0 ? colors.textMuted : '#fff'} />
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {safePage + 1} / {totalPages}
          </Text>
          <TouchableOpacity
            onPress={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            style={{ padding: 8, borderRadius: 8, backgroundColor: safePage >= totalPages - 1 ? colors.surfaceAlt : colors.primary, opacity: safePage >= totalPages - 1 ? 0.4 : 1 }}
            data-testid="loan-history-page-next"
          >
            <Ionicons name="chevron-forward" size={18} color={safePage >= totalPages - 1 ? colors.textMuted : '#fff'} />
          </TouchableOpacity>
        </View>
      )}
    </>
  );
};
