import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ta } from '../utils/adminI18n';
import { parseAmount } from '../utils/money';
import { Scoring, Flag, Evidence, RiskLabel, riskFromFlags, suggestForPrice } from '../utils/statementScoring';
import { SCORING } from '../config/statementScoringConfig';

const RISK_COLORS: Record<RiskLabel, string> = { low: '#10B981', medium: '#F59E0B', high: '#EF4444' };
const FLAG_ORDER = ['quick_loans', 'collector', 'new_history', 'income_stopped', 'gambling'];

interface Props {
  scoring: Scoring;
  language: string;
  fmt: (n: number | null | undefined) => string;
  scanNote?: boolean;
  cutOffNote?: boolean;
}

export function StatementScoreCards({ scoring, language, fmt, scanNote, cutOffNote }: Props) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [override, setOverride] = useState<RiskLabel | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [priceText, setPriceText] = useState('');

  const aff = scoring.affordability;
  const flags = FLAG_ORDER.map((id) => scoring.flags.find((f) => f.id === id)).filter(Boolean) as Flag[];
  const auto = riskFromFlags(scoring.flags, dismissed);
  const label: RiskLabel = override || auto.label;
  const price = parseAmount(priceText);
  const forPrice = price && price > 0 ? suggestForPrice(aff, price) : null;
  const pct = Math.round(aff.repayment_share * 100);

  const toggleDismiss = (id: string) =>
    setDismissed((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const row = (label_: string, value: string, strong?: boolean, sub?: boolean) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, sub && { paddingLeft: 12, fontSize: 13 }]}>{label_}</Text>
      <Text style={[styles.rowValue, strong && { fontSize: 16 }]}>{value}</Text>
    </View>
  );

  const evLine = (e: Evidence, i: number) => (
    <View key={i} style={styles.evRow}>
      <Text style={styles.evText} numberOfLines={3}>
        {e.date ? `${e.date}  ` : ''}{e.description}
      </Text>
      {e.amount != null && (
        <Text style={[styles.evAmt, { color: e.direction === 'in' ? '#10B981' : e.direction === 'out' ? '#EF4444' : '#CBD5E1' }]}>
          {e.direction === 'in' ? '+' : e.direction === 'out' ? '-' : ''}{fmt(e.amount).replace('-', '')}
        </Text>
      )}
    </View>
  );

  return (
    <View>
      {/* ---------------- risk label ---------------- */}
      <View style={[styles.card, { borderColor: RISK_COLORS[label] + '66' }]} data-testid="risk-label-card">
        <Text style={styles.title}>{ta(language, 'scRiskTitle')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={[styles.badge, { backgroundColor: RISK_COLORS[label] + '22' }]}>
            <Text style={[styles.badgeText, { color: RISK_COLORS[label] }]}>{ta(language, `risk_${label}`)}</Text>
          </View>
          {override ? <Text style={styles.muted}>{ta(language, 'scOverridden')}</Text> : null}
        </View>
        <Text style={styles.muted}>
          {ta(language, 'scRiskTriggered', { n: auto.triggered })}
          {auto.unknown > 0 ? ` · ${ta(language, 'scRiskUnknown', { n: auto.unknown })}` : ''}
        </Text>
        <Text style={styles.muted}>{ta(language, 'scLowIncomeNote')}</Text>
        {auto.triggered === 0 && auto.unknown >= 3 ? <Text style={[styles.muted, { color: '#F59E0B' }]}>{ta(language, 'scLowConfidence')}</Text> : null}
        <Text style={[styles.muted, { marginTop: 8 }]}>{ta(language, 'scOverride')}:</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {(['low', 'medium', 'high'] as RiskLabel[]).map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setOverride(override === r ? null : r)}
              style={[styles.chip, override === r && { backgroundColor: RISK_COLORS[r] + '33', borderColor: RISK_COLORS[r] }]}
            >
              <Text style={{ color: override === r ? RISK_COLORS[r] : '#CBD5E1', fontWeight: '700', fontSize: 13 }}>{ta(language, `risk_${r}`)}</Text>
            </TouchableOpacity>
          ))}
          {override ? (
            <TouchableOpacity onPress={() => setOverride(null)} style={styles.chip}>
              <Text style={{ color: '#38BDF8', fontWeight: '700', fontSize: 13 }}>{ta(language, 'scReset')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ---------------- affordability ---------------- */}
      <View style={[styles.card, { borderColor: '#2563EB66' }]} data-testid="affordability-card">
        <Text style={styles.title}>{ta(language, 'scAfford')}</Text>
        {!aff.evaluable ? (
          <Text style={styles.muted}>{ta(language, 'scNoIncome')}</Text>
        ) : (
          <>
            <Text style={styles.big}>
              {aff.suggested_monthly_payment > 0
                ? ta(language, 'scCanAfford', { amount: fmt(aff.suggested_monthly_payment) })
                : ta(language, 'scCannotAfford')}
            </Text>
            <Text style={styles.muted}>{ta(language, 'scShare', { pct })}</Text>
            <View style={{ height: 8 }} />
            {row(ta(language, 'scIncome'), fmt(aff.monthly_income))}
            {aff.benefits_income > 0 && row(ta(language, 'scBenefitsPart'), fmt(aff.benefits_income), false, true)}
            {row(`- ${ta(language, 'scRent')}`, fmt(aff.monthly_rent))}
            {row(`- ${ta(language, 'scUtilities')}`, fmt(aff.monthly_utilities))}
            {row(`- ${ta(language, 'scLoanPay')}`, fmt(aff.monthly_loan_payments))}
            {row(`= ${ta(language, 'scDisposable')}`, fmt(aff.disposable), true)}
            <View style={styles.divider} />
            {row(ta(language, 'scPayment'), fmt(aff.suggested_monthly_payment), true)}
            {aff.suggested_term_months > 0 && row(ta(language, 'scTerm'), ta(language, 'scMonths', { n: aff.suggested_term_months }))}
            {aff.suggested_term_months > 0 && row(ta(language, 'scMaxLoan'), fmt(aff.max_loan), true)}
            {aff.suggested_term_months > 0 && aff.suggested_term_months < (scoring.constants.MAX_TERM_MONTHS ?? SCORING.MAX_TERM_MONTHS) &&
              row(ta(language, 'scMaxLoanLong', { n: scoring.constants.MAX_TERM_MONTHS ?? SCORING.MAX_TERM_MONTHS }), fmt(aff.max_loan_at_max_term), false, true)}
            {aff.excluded_loan_inflows > 0 && row(ta(language, 'scExcluded'), fmt(aff.excluded_loan_inflows), false, true)}

            <View style={styles.divider} />
            <Text style={styles.muted}>{ta(language, 'scPrice')}</Text>
            <TextInput
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#64748B"
              style={styles.input}
              data-testid="item-price-input"
            />
            {forPrice ? (
              <View style={{ marginTop: 8 }}>
                {forPrice.monthly > 0 && row(ta(language, 'scNeedTerm'), `${ta(language, 'scMonths', { n: forPrice.term })} · ${fmt(forPrice.monthly)}`)}
                {forPrice.monthly === 0 && <Text style={styles.muted}>{ta(language, 'scDownAll')}</Text>}
                {row(ta(language, 'scDown'), forPrice.down_payment > 0 ? fmt(forPrice.down_payment) : ta(language, 'scDownNone'), true)}
              </View>
            ) : (
              <Text style={[styles.muted, { marginTop: 4 }]}>{ta(language, 'scPriceHint')}</Text>
            )}
            <Text style={[styles.muted, { marginTop: 8 }]}>
              {ta(language, 'scMonthsBasis', { n: aff.months })} · {ta(language, 'scInterestNote')}
            </Text>
            <Text style={styles.muted}>{ta(language, 'scIncomeHint')}</Text>
          </>
        )}
      </View>

      {/* ---------------- intent flags ---------------- */}
      <View style={styles.card} data-testid="intent-flags-card">
        <Text style={styles.title}>{ta(language, 'scFlagsTitle')}</Text>
        <Text style={styles.muted}>{ta(language, 'scFlagsSub')}</Text>
        {scanNote ? <Text style={[styles.muted, { color: '#F59E0B' }]}>{ta(language, 'scScanNote')}</Text> : null}
        {cutOffNote ? <Text style={[styles.muted, { color: '#F59E0B' }]}>{ta(language, 'scCutOff')}</Text> : null}
        {flags.map((f) => {
          const isDismissed = dismissed.includes(f.id);
          const color = f.state === 'yes' ? (isDismissed ? '#64748B' : '#EF4444') : f.state === 'no' ? '#10B981' : '#94A3B8';
          const icon = f.state === 'yes' ? 'alert-circle' : f.state === 'no' ? 'checkmark-circle' : 'help-circle';
          const params = { ...f.params, share: f.params.share ?? 0 };
          const expanded = open === f.id;
          return (
            <View key={f.id} style={styles.flagBox}>
              <TouchableOpacity onPress={() => setOpen(expanded ? null : f.id)} style={styles.flagHead} data-testid={`flag-${f.id}`}>
                <Ionicons name={icon as any} size={22} color={color} />
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={styles.flagName}>{ta(language, `fl_${f.id}`)}</Text>
                  <Text style={styles.muted}>{ta(language, `fl_${f.id}_d`, params)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color, fontWeight: '800', fontSize: 14 }}>
                    {f.state === 'yes' ? ta(language, 'scYes') : f.state === 'no' ? ta(language, 'scNo') : ta(language, 'scUnknown')}
                  </Text>
                  {isDismissed && <Text style={styles.tiny}>{ta(language, 'scDismissed')}</Text>}
                </View>
              </TouchableOpacity>
              {expanded && (
                <View style={{ marginTop: 8 }}>
                  {f.reason ? <Text style={styles.reason}>{ta(language, `rs_${f.reason}`, { ...f.params })}</Text> : null}
                  {f.state !== 'unknown' && (
                    <Text style={styles.muted}>{ta(language, 'scFound', { n: f.count, total: fmt(f.total) })}</Text>
                  )}
                  <Text style={[styles.muted, { marginTop: 6, fontWeight: '700' }]}>{ta(language, 'scEvidence')}</Text>
                  {f.evidence.length === 0 ? (
                    <Text style={styles.muted}>{ta(language, 'scNoEvidence')}</Text>
                  ) : (
                    f.evidence.slice(0, 20).map(evLine)
                  )}
                  {f.state === 'yes' && (
                    <TouchableOpacity onPress={() => toggleDismiss(f.id)} style={[styles.chip, { alignSelf: 'flex-start', marginTop: 8 }]}>
                      <Text style={{ color: '#38BDF8', fontWeight: '700', fontSize: 13 }}>
                        {isDismissed ? ta(language, 'scRestore') : ta(language, 'scDismiss')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <Text style={[styles.tiny, { marginTop: 8 }]}>
          {scoring.source === 'server' ? ta(language, 'scSourceServer') : ta(language, 'scSourceDevice')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#152035', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E3050', gap: 4 },
  title: { fontSize: 14, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  big: { fontSize: 20, fontWeight: '800', color: '#fff' },
  muted: { fontSize: 12.5, color: '#94A3B8', lineHeight: 18 },
  tiny: { fontSize: 11, color: '#64748B' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 10 },
  rowLabel: { fontSize: 14, color: '#94A3B8', flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  divider: { height: 1, backgroundColor: '#1E3050', marginVertical: 8 },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  badgeText: { fontSize: 18, fontWeight: '800' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  input: { backgroundColor: '#0B1527', borderColor: '#334155', borderWidth: 1, borderRadius: 8, color: '#fff', paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, marginTop: 4 },
  flagBox: { borderTopWidth: 1, borderTopColor: '#1E3050', paddingVertical: 10 },
  flagHead: { flexDirection: 'row', alignItems: 'center' },
  flagName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  reason: { fontSize: 12.5, color: '#F59E0B', lineHeight: 18, marginBottom: 4 },
  evRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#1E3050' },
  evText: { flex: 1, fontSize: 12, color: '#CBD5E1' },
  evAmt: { fontSize: 12.5, fontWeight: '700' },
});
