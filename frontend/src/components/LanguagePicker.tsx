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
import { useLanguage, LANGUAGES, Language } from '../context/LanguageContext';

const FLAG_EMOJI: Record<string, string> = {
  EU: '\uD83C\uDDEA\uD83C\uDDFA', NO: '\uD83C\uDDF3\uD83C\uDDF4', SE: '\uD83C\uDDF8\uD83C\uDDEA',
  DK: '\uD83C\uDDE9\uD83C\uDDF0', FI: '\uD83C\uDDEB\uD83C\uDDEE', EE: '\uD83C\uDDEA\uD83C\uDDEA',
  LV: '\uD83C\uDDF1\uD83C\uDDFB', LT: '\uD83C\uDDF1\uD83C\uDDF9', AT: '\uD83C\uDDE6\uD83C\uDDF9',
  CZ: '\uD83C\uDDE8\uD83C\uDDFF', PL: '\uD83C\uDDF5\uD83C\uDDF1', CH: '\uD83C\uDDE8\uD83C\uDDED',
  ES: '\uD83C\uDDEA\uD83C\uDDF8', DE: '\uD83C\uDDE9\uD83C\uDDEA', FR: '\uD83C\uDDEB\uD83C\uDDF7',
  IT: '\uD83C\uDDEE\uD83C\uDDF9',
};

interface LanguagePickerProps {
  compact?: boolean;
  colors?: {
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    background: string;
  };
}

export const LanguagePicker = ({ compact, colors: themeColors }: LanguagePickerProps) => {
  const { language, setLanguage, t } = useLanguage();
  const [visible, setVisible] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  const colors = themeColors || {
    surface: '#152035', text: '#F8FAFC', textMuted: '#94A3B8',
    border: '#1E3050', primary: '#2563EB', background: '#0B1527',
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.selector,
          { backgroundColor: colors.surface, borderColor: colors.border },
          compact && styles.selectorCompact,
        ]}
        onPress={() => setVisible(true)}
        data-testid="language-picker-btn"
      >
        <Text style={styles.flag}>{FLAG_EMOJI[currentLang.flag] || ''}</Text>
        <Text style={[styles.selectorText, { color: colors.text }, compact && styles.selectorTextCompact]} numberOfLines={1}>
          {compact ? currentLang.code.toUpperCase() : currentLang.name}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 14 : 16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.dropdownTitle, { color: colors.text }]}>{t('language')}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.option,
                    { borderBottomColor: colors.border },
                    item.code === language && { backgroundColor: `${colors.primary}18` },
                  ]}
                  onPress={() => { setLanguage(item.code); setVisible(false); }}
                  data-testid={`lang-option-${item.code}`}
                >
                  <Text style={styles.optionFlag}>{FLAG_EMOJI[item.flag] || ''}</Text>
                  <Text style={[styles.optionText, { color: colors.text }]}>{item.name}</Text>
                  {item.code === language && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              style={styles.list}
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
    gap: 8,
  },
  selectorCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  flag: {
    fontSize: 18,
  },
  selectorText: {
    fontSize: 15,
    fontWeight: '500',
  },
  selectorTextCompact: {
    fontSize: 13,
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
    maxHeight: '70%',
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
  list: {
    maxHeight: 400,
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
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
