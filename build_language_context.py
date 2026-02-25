"""Build the updated LanguageContext.tsx with all translations."""
import json

with open('/app/translations_output.json') as f:
    data = json.load(f)

# Order of languages in each entry
LANG_ORDER = ['en', 'et', 'no', 'sv', 'da', 'fi', 'lv', 'lt', 'de_at', 'cs', 'pl', 'de_ch', 'es', 'de', 'fr', 'it']

def escape_ts_string(s):
    """Escape a string for use in TypeScript single-quoted strings."""
    if not isinstance(s, str):
        return str(s)
    # Escape single quotes and backslashes
    s = s.replace('\\', '\\\\')
    s = s.replace("'", "\\'")
    # Keep \n as literal newline representation
    s = s.replace('\n', '\\n')
    return s

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
lines.append("  { code: 'lv', name: 'Latvie\\u0161u', flag: 'LV' },")
lines.append("  { code: 'lt', name: 'Lietuvi\\u0173', flag: 'LT' },")
lines.append("  { code: 'de_at', name: '\\u00D6sterreichisch', flag: 'AT' },")
lines.append("  { code: 'cs', name: '\\u010Ce\\u0161tina', flag: 'CZ' },")
lines.append("  { code: 'pl', name: 'Polski', flag: 'PL' },")
lines.append("  { code: 'de_ch', name: 'Schweizerdeutsch', flag: 'CH' },")
lines.append("  { code: 'es', name: 'Espa\\u00F1ol', flag: 'ES' },")
lines.append("  { code: 'de', name: 'Deutsch', flag: 'DE' },")
lines.append("  { code: 'fr', name: 'Fran\\u00E7ais', flag: 'FR' },")
lines.append("  { code: 'it', name: 'Italiano', flag: 'IT' },")
lines.append("];")
lines.append("")
lines.append("const translations: Record<string, Partial<Record<Language, string>>> = {")

# Write each translation key
for key, translations_dict in data.items():
    parts = []
    for lang in LANG_ORDER:
        if lang in translations_dict:
            val = escape_ts_string(translations_dict[lang])
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

with open('/app/frontend/src/context/LanguageContext.tsx', 'w') as f:
    f.write(content)

print(f"Written {len(lines)} lines to LanguageContext.tsx")
print(f"File size: {len(content)} bytes")
