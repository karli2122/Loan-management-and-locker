import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import {
  LoanStatusInput,
  LoanStatusStyle,
  resolveLoanStatus,
} from './loanStatus';

type Props = {
  status?: LoanStatusStyle;
  input?: LoanStatusInput;
  label?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function StatusChip({ status, input, label, style, compact }: Props) {
  const resolved = status || resolveLoanStatus(input || {});
  return (
    <View
      style={[
        styles.chip,
        compact && styles.compact,
        { backgroundColor: resolved.background, borderColor: resolved.color },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label || resolved.label}
    >
      <View style={[styles.dot, { backgroundColor: resolved.color }]} />
      <Text style={[styles.text, compact && styles.textCompact, { color: resolved.color }]}>
        {label || resolved.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  textCompact: {
    fontSize: 11,
  },
});
