import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCurrency, CURRENCIES, CurrencyCode } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';

const FLAG_EMOJI: Record<string, string> = {
  EU: '\uD83C\uDDEA\uD83C\uDDFA', NO: '\uD83C\uDDF3\uD83C\uDDF4', SE: '\uD83C\uDDF8\uD83C\uDDEA',
  DK: '\uD83C\uDDE9\uD83C\uDDF0', PL: '\uD83C\uDDF5\uD83C\uDDF1', CH: '\uD83C\uDDE8\uD83C\uDDED',
  GB: '\uD83C\uDDEC\uD83C\uDDE7', US: '\uD83C\uDDFA\uD83C\uDDF8',
};

interface CurrencyPickerProps {
  colors?: {
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    background: string;
  };
}

export const CurrencyPicker = ({ colors: themeColors }: CurrencyPickerProps) => {
  const { currency, setCurrency } = useCurrency();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const colors = themeColors || {
    surface: '#152035', text: '#F8FAFC', textMuted: '#94A3B8',
    border: '#1E3050', primary: '#2563EB', background: '#0B1527',
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.selector, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setVisible(true)}
        data-testid="currency-picker-btn"
      >
        <Text style={styles.flag}>{FLAG_EMOJI[currentCurrency.flag] || ''}</Text>
        <View style={styles.selectorInfo}>
          <Text style={[styles.selectorCode, { color: colors.text }]}>{currentCurrency.code}</Text>
          <Text style={[styles.selectorName, { color: colors.textMuted }]}>{currentCurrency.symbol} - {currentCurrency.name}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.dropdownTitle, { color: colors.text }]}>{t('currency')}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={CURRENCIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    { borderBottomColor: colors.border },
                    item.code === currency && { backgroundColor: `${colors.primary}18` },
                  ]}
                  onPress={() => { setCurrency(item.code); setVisible(false); }}
                  data-testid={`currency-option-${item.code}`}
                >
                  <Text style={styles.optionFlag}>{FLAG_EMOJI[item.flag] || ''}</Text>
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionCode, { color: colors.text }]}>{item.code}</Text>
                    <Text style={[styles.optionName, { color: colors.textMuted }]}>{item.symbol} - {item.name}</Text>
                  </View>
                  {item.code === currency && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  flag: {
    fontSize: 22,
  },
  selectorInfo: {
    flex: 1,
  },
  selectorCode: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectorName: {
    fontSize: 12,
    marginTop: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdown: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dropdownTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  optionFlag: {
    fontSize: 22,
  },
  optionInfo: {
    flex: 1,
  },
  optionCode: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionName: {
    fontSize: 12,
    marginTop: 1,
  },
});
