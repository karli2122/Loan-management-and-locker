import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { useCurrency } from '../../context/CurrencyContext';

interface Props {
  paymentHistory: any[];
  paymentHistoryLoading: boolean;
  language: string;
  colors: any;
}

export const PaymentHistory = ({ paymentHistory, paymentHistoryLoading, language, colors }: Props) => {
  const { formatAmount } = useCurrency();
  return (
  <View style={[styles.section, { backgroundColor: colors.surface }]} data-testid="payment-history-section">
    <Text style={[styles.sectionTitle, { color: colors.text }]}>
      {language === 'et' ? 'Makseajalugu' : 'Payment History'}
    </Text>
    {paymentHistoryLoading ? (
      <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
    ) : paymentHistory.length === 0 ? (
      <View style={styles.emptyLoanHistory}>
        <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
        <Text style={[styles.emptyLoanHistoryText, { color: colors.textMuted }]}>
          {language === 'et' ? 'Makseid pole' : 'No payments yet'}
        </Text>
      </View>
    ) : (
      paymentHistory.map((payment: any, index: number) => (
        <View
          key={payment.id || index}
          style={[
            styles.paymentHistoryItem,
            { borderBottomColor: colors.border },
            index === paymentHistory.length - 1 && { borderBottomWidth: 0 },
          ]}
          data-testid={`payment-item-${index}`}
        >
          <View style={styles.paymentHistoryLeft}>
            <Text style={[styles.paymentHistoryAmount, { color: '#10B981' }]}>
              {formatAmount(payment.amount || 0)}
            </Text>
            <Text style={[styles.paymentHistoryDate, { color: colors.textMuted }]}>
              {payment.payment_date
                ? new Date(payment.payment_date).toLocaleDateString('et-EE', { day: 'numeric', month: 'short', year: 'numeric' })
                : '-'}
            </Text>
          </View>
          <View style={styles.paymentHistoryRight}>
            <View style={[styles.paymentMethodBadge, { backgroundColor: colors.surfaceAlt || '#334155' }]}>
              <Ionicons
                name={payment.payment_method === 'cash' ? 'cash' : payment.payment_method === 'bank_transfer' ? 'swap-horizontal' : 'card'}
                size={14}
                color={colors.textMuted}
              />
              <Text style={[styles.paymentMethodLabel, { color: colors.textMuted }]}>
                {payment.payment_method === 'cash'
                  ? (language === 'et' ? 'Sularaha' : 'Cash')
                  : payment.payment_method === 'bank_transfer'
                  ? (language === 'et' ? '\u00dclekanne' : 'Transfer')
                  : (language === 'et' ? 'Kaart' : 'Card')}
              </Text>
            </View>
            {payment.notes ? (
              <Text style={[styles.paymentHistoryNotes, { color: colors.textMuted }]} numberOfLines={1}>
                {payment.notes}
              </Text>
            ) : null}
          </View>
        </View>
      ))
    )}
  </View>
);
