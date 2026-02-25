"""Build the updated LanguageContext.tsx with all translations."""
import json
import re

with open('/app/translations_output.json') as f:
    data = json.load(f)

LANG_ORDER = ['en', 'et', 'no', 'sv', 'da', 'fi', 'lv', 'lt', 'de_at', 'cs', 'pl', 'de_ch', 'es', 'de', 'fr', 'it']

def decode_unicode_escapes(s):
    """Decode \\uXXXX sequences to actual Unicode characters."""
    if not isinstance(s, str):
        return str(s)
    def replacer(m):
        return chr(int(m.group(1), 16))
    return re.sub(r'\\u([0-9a-fA-F]{4})', replacer, s)

def escape_for_ts(s):
    """Escape a string for TypeScript single-quoted string, keeping Unicode chars as-is."""
    if not isinstance(s, str):
        return str(s)
    # First decode any \uXXXX sequences to actual chars
    s = decode_unicode_escapes(s)
    # Escape backslashes (but not ones we want to keep like \n)
    # Replace actual backslashes with \\, except \n and \t
    result = []
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == '\\' and i + 1 < len(s) and s[i+1] == 'n':
            result.append('\\n')
            i += 2
        elif ch == '\\' and i + 1 < len(s) and s[i+1] == 't':
            result.append('\\t')
            i += 2
        elif ch == '\\':
            result.append('\\\\')
            i += 1
        elif ch == "'":
            result.append("\\'")
            i += 1
        else:
            result.append(ch)
            i += 1
    return ''.join(result)

lines = []
lines.append("import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';")
lines.append("import AsyncStorage from '@react-native-async-storage/async-storage';")
lines.append("")
lines.append("export type Language = 'en' | 'no' | 'sv' | 'da' | 'fi' | 'et' | 'lv' | 'lt' | 'de_at' | 'cs' | 'pl' | 'de_ch' | 'es' | 'de' | 'fr' | 'it';")
lines.append("")
lines.append("export interface LanguageOption {")
lines.append("  code: Language;")
lines.append("  name: string;")
lines.append("  flag: string;")
lines.append("}")
lines.append("")
lines.append("export const LANGUAGES: LanguageOption[] = [")
lines.append("  { code: 'en', name: 'English', flag: 'GB' },")
lines.append("  { code: 'no', name: 'Norsk', flag: 'NO' },")
lines.append("  { code: 'sv', name: 'Svenska', flag: 'SE' },")
lines.append("  { code: 'da', name: 'Dansk', flag: 'DK' },")
lines.append("  { code: 'fi', name: 'Suomi', flag: 'FI' },")
lines.append("  { code: 'et', name: 'Eesti', flag: 'EE' },")
lines.append("  { code: 'lv', name: 'Latviešu', flag: 'LV' },")
lines.append("  { code: 'lt', name: 'Lietuvių', flag: 'LT' },")
lines.append("  { code: 'de_at', name: 'Österreichisch', flag: 'AT' },")
lines.append("  { code: 'cs', name: 'Čeština', flag: 'CZ' },")
lines.append("  { code: 'pl', name: 'Polski', flag: 'PL' },")
lines.append("  { code: 'de_ch', name: 'Schweizerdeutsch', flag: 'CH' },")
lines.append("  { code: 'es', name: 'Español', flag: 'ES' },")
lines.append("  { code: 'de', name: 'Deutsch', flag: 'DE' },")
lines.append("  { code: 'fr', name: 'Français', flag: 'FR' },")
lines.append("  { code: 'it', name: 'Italiano', flag: 'IT' },")
lines.append("];")
lines.append("")
lines.append("const translations: Record<string, Partial<Record<Language, string>>> = {")

for key, translations_dict in data.items():
    parts = []
    for lang in LANG_ORDER:
        if lang in translations_dict:
            val = escape_for_ts(translations_dict[lang])
            parts.append(f"{lang}: '{val}'")
    
    entry = ', '.join(parts)
    lines.append(f"  {key}: {{ {entry} }},")

lines.append("};")
lines.append("")
lines.append("// German-based fallback languages")
lines.append("const germanFallbacks: Language[] = ['de_at', 'de_ch'];")
lines.append("")
lines.append("interface LanguageContextType {")
lines.append("  language: Language;")
lines.append("  setLanguage: (lang: Language) => void;")
lines.append("  t: (key: string) => string;")
lines.append("}")
lines.append("")
lines.append("const LanguageContext = createContext<LanguageContextType | undefined>(undefined);")
lines.append("")
lines.append("export const LanguageProvider = ({ children }: { children: ReactNode }) => {")
lines.append("  const [language, setLanguageState] = useState<Language>('en');")
lines.append("")
lines.append("  useEffect(() => {")
lines.append("    loadLanguage();")
lines.append("  }, []);")
lines.append("")
lines.append("  const loadLanguage = async () => {")
lines.append("    try {")
lines.append("      const saved = await AsyncStorage.getItem('app_language');")
lines.append("      if (saved && LANGUAGES.some(l => l.code === saved)) {")
lines.append("        setLanguageState(saved as Language);")
lines.append("      }")
lines.append("    } catch (error) {")
lines.append("      console.error('Error loading language:', error);")
lines.append("    }")
lines.append("  };")
lines.append("")
lines.append("  const setLanguage = async (lang: Language) => {")
lines.append("    try {")
lines.append("      await AsyncStorage.setItem('app_language', lang);")
lines.append("      setLanguageState(lang);")
lines.append("    } catch (error) {")
lines.append("      console.error('Error saving language:', error);")
lines.append("    }")
lines.append("  };")
lines.append("")
lines.append("  const t = (key: string): string => {")
lines.append("    const entry = translations[key];")
lines.append("    if (!entry) return key;")
lines.append("")
lines.append("    // Try exact language match")
lines.append("    if (entry[language]) return entry[language]!;")
lines.append("")
lines.append("    // Fallback for German variants -> German")
lines.append("    if (germanFallbacks.includes(language) && entry['de']) return entry['de']!;")
lines.append("")
lines.append("    // Final fallback: English")
lines.append("    return entry['en'] || key;")
lines.append("  };")
lines.append("")
lines.append("  return (")
lines.append("    <LanguageContext.Provider value={{ language, setLanguage, t }}>")
lines.append("      {children}")
lines.append("    </LanguageContext.Provider>")
lines.append("  );")
lines.append("};")
lines.append("")
lines.append("")
lines.append("export const useLanguage = () => {")
lines.append("  const context = useContext(LanguageContext);")
lines.append("  if (!context) {")
lines.append("    throw new Error('useLanguage must be used within a LanguageProvider');")
lines.append("  }")
lines.append("  return context;")
lines.append("};")
lines.append("")

content = '\n'.join(lines)

with open('/app/frontend/src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Written {len(lines)} lines to LanguageContext.tsx")
print(f"File size: {len(content.encode('utf-8'))} bytes")

# Verify some entries
test_lines = [l for l in content.split('\n') if 'appTitle' in l]
if test_lines:
    print(f"Sample entry: {test_lines[0][:200]}")
