import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CurrencyCode = 'EUR' | 'NOK' | 'SEK' | 'DKK' | 'PLN' | 'CHF' | 'GBP' | 'USD';

export interface CurrencyOption {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  rateFromEUR: number; // approximate conversion rate from EUR
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'EUR', symbol: '\u20AC', name: 'Euro', flag: 'EU', rateFromEUR: 1 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: 'NO', rateFromEUR: 11.5 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: 'SE', rateFromEUR: 11.2 },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', flag: 'DK', rateFromEUR: 7.46 },
  { code: 'PLN', symbol: 'z\u0142', name: 'Polish Zloty', flag: 'PL', rateFromEUR: 4.32 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: 'CH', rateFromEUR: 0.94 },
  { code: 'GBP', symbol: '\u00A3', name: 'British Pound', flag: 'GB', rateFromEUR: 0.86 },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: 'US', rateFromEUR: 1.08 },
];

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  formatAmount: (eurAmount: number, decimals?: number) => string;
  currencySymbol: string;
  convertFromEUR: (eurAmount: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>('EUR');

  useEffect(() => {
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      const saved = await AsyncStorage.getItem('app_currency');
      if (saved && CURRENCIES.some(c => c.code === saved)) {
        setCurrencyState(saved as CurrencyCode);
      }
    } catch (error) {
      console.error('Error loading currency:', error);
    }
  };

  const setCurrency = async (code: CurrencyCode) => {
    try {
      await AsyncStorage.setItem('app_currency', code);
      setCurrencyState(code);
    } catch (error) {
      console.error('Error saving currency:', error);
    }
  };

  const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];

  const convertFromEUR = (eurAmount: number): number => {
    return eurAmount * currentCurrency.rateFromEUR;
  };

  const formatAmount = (eurAmount: number, decimals: number = 2): string => {
    const converted = convertFromEUR(eurAmount);
    const formatted = converted.toFixed(decimals);
    return `${currentCurrency.symbol}${formatted}`;
  };

  return (
    <CurrencyContext.Provider value={{
      currency,
      setCurrency,
      formatAmount,
      currencySymbol: currentCurrency.symbol,
      convertFromEUR,
    }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
