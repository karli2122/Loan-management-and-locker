import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { StatusChip } from '../theme/StatusChip';
import { LoanStatusInput, resolveLoanStatus } from '../theme/loanStatus';

type Props = {
  percentPaid?: number | null;
  daysUntilDue?: number | null;
  nextPaymentAmount?: number | null;
  outstandingBalance?: number | null;
  formatAmount: (n: number) => string;
  t: (key: string) => string;
  statusInput?: LoanStatusInput;
};

function ProgressRing({
  percent,
  size = 132,
  stroke = 10,
  color,
  trackColor,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

function daysLabel(days: number | null | undefined, t: (k: string) => string): string {
  if (days == null || Number.isNaN(days)) return t('noDueDate') || 'No due date';
  if (days === 0) return t('dueToday') || 'Due today';
  if (days === 1) return t('dueTomorrow') || 'Due tomorrow';
  if (days > 1) return `${days} ${t('daysUntilPayment') || 'days until payment'}`;
  const overdue = Math.abs(days);
  return `${overdue}d ${t('overdue') || 'overdue'}`;
}

export function LoanCountdown({
  percentPaid = 0,
  daysUntilDue,
  nextPaymentAmount = 0,
  outstandingBalance = 0,
  formatAmount,
  t,
  statusInput,
}: Props) {
  const status = resolveLoanStatus(
    statusInput || {
      outstanding_balance: outstandingBalance,
      days_until_due: daysUntilDue ?? null,
    }
  );
  const percent = Number(percentPaid || 0);

  return (
    <View style={styles.card} testID="loan-countdown">
      <View style={styles.header}>
        <Text style={styles.title}>{t('loanProgress') || 'Loan progress'}</Text>
        <StatusChip status={status} />
      </View>
      <View style={styles.body}>
        <ProgressRing
          percent={percent}
          color={status.color}
          trackColor="rgba(148, 163, 184, 0.25)"
        >
          <Text style={[styles.percent, { color: status.color }]}>{Math.round(percent)}%</Text>
          <Text style={styles.percentHint}>{t('paid') || 'paid'}</Text>
        </ProgressRing>
        <View style={styles.metrics}>
          <Text style={styles.metricLabel}>{t('daysUntilNextPayment') || 'Days until next payment'}</Text>
          <Text style={[styles.metricValue, daysUntilDue != null && daysUntilDue < 0 && { color: '#F97316' }]}>
            {daysLabel(daysUntilDue, t)}
          </Text>
          <Text style={[styles.metricLabel, { marginTop: 12 }]}>
            {t('nextAmountDue') || 'Next amount due'}
          </Text>
          <Text style={styles.metricValue}>{formatAmount(Number(nextPaymentAmount || 0))}</Text>
          <Text style={[styles.metricLabel, { marginTop: 12 }]}>
            {t('remainingBalance') || 'Remaining balance'}
          </Text>
          <Text style={styles.metricValue}>{formatAmount(Number(outstandingBalance || 0))}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  percent: {
    fontSize: 22,
    fontWeight: '800',
  },
  percentHint: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metrics: {
    flex: 1,
    marginLeft: 16,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
});
