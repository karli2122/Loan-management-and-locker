import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getAuthInfo, handleAuthFailure } from '../../src/utils/adminAuth';
import { DatePicker } from '../../src/components/DatePicker';


export default function AddClient() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    birth_number: '',
    emi_amount: '',
    loan_given_date: new Date().toISOString().split('T')[0],
    emi_due_date: '',
    loan_amount: '',
    down_payment: '',
    interest_rate: '',
    loan_tenure_months: '',
  });

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      const auth = await getAuthInfo();
      if (!auth) { await handleAuthFailure(router, language); return; }

      const requestBody = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        birth_number: form.birth_number,
        emi_amount: parseFloat(form.emi_amount) || 0,
        emi_due_date: form.emi_due_date || undefined,
        loan_amount: parseFloat(form.loan_amount) || 0,
        down_payment: parseFloat(form.down_payment) || 0,
        interest_rate: parseFloat(form.interest_rate) || 0,
        loan_tenure_months: parseInt(form.loan_tenure_months) || 0,
      };
      
      console.log('Creating client with data:', requestBody);
      const response = await fetch(`${API_URL}/api/clients?admin_token=${auth.token}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Create client response status:', response.status);
      
      if (response.status === 401) {
        await handleAuthFailure(router, language);
        return;
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Parse error:', responseText.substring(0, 200));
        throw new Error('Server error. Please try again.');
      }

      if (!response.ok) {
        // Handle different error response formats
        let errorMessage = 'Failed to create client';
        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            // Pydantic validation errors
            errorMessage = data.detail.map((err: any) => err.msg || err.message || JSON.stringify(err)).join(', ');
          } else if (typeof data.detail === 'object') {
            errorMessage = data.detail.msg || data.detail.message || JSON.stringify(data.detail);
          }
        }
        throw new Error(errorMessage);
      }

      const client = data;
      console.log('Client created successfully:', client.id);
      Alert.alert(
        t('success'),
        language === 'et' 
          ? 'Klient lisatud! Minge kliendi detailide juurde, et genereerida registreerimiskood.'
          : 'Client created! Go to client details to generate registration key.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Add client error:', error);
      // Extract meaningful error message from various error formats
      let errorMessage = 'Something went wrong';
      
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Try to extract message from common error object properties
        errorMessage = error.message || error.detail || error.error || JSON.stringify(error);
      }
      
      Alert.alert(t('error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('addNewClient')}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <Text style={styles.label}>{t('fullName')} *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterClientName')}
                placeholderTextColor="#64748B"
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
              />
            </View>

            <Text style={styles.label}>{t('phoneNumber')} *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterPhone')}
                placeholderTextColor="#64748B"
                value={form.phone}
                onChangeText={(text) => setForm({ ...form, phone: text })}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={styles.label}>{t('emailAddress')} *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterEmail')}
                placeholderTextColor="#64748B"
                value={form.email}
                onChangeText={(text) => setForm({ ...form, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>{language === 'et' ? 'Aadress' : 'Address'}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="location" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Sisesta aadress' : 'Enter address'}
                placeholderTextColor="#64748B"
                value={form.address}
                onChangeText={(text) => setForm({ ...form, address: text })}
              />
            </View>

            <Text style={styles.label}>{language === 'et' ? 'Isikukood' : 'Birth Number'}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="card" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Sisesta isikukood' : 'Enter birth number'}
                placeholderTextColor="#64748B"
                value={form.birth_number}
                onChangeText={(text) => setForm({ ...form, birth_number: text })}
              />
            </View>

            <Text style={styles.label}>{t('emiAmount')}</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>€</Text>
              <TextInput
                style={styles.input}
                placeholder={t('enterEmiAmount')}
                placeholderTextColor="#64748B"
                value={form.emi_amount}
                onChangeText={(text) => setForm({ ...form, emi_amount: text })}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.sectionDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.sectionTitle}>{language === 'et' ? 'Laenu andmed' : 'Loan Details'}</Text>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.label}>{language === 'et' ? 'Igakuine intressimäär (%)' : 'Interest Rate Monthly (%)'}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="trending-up" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Sisesta intressimäär' : 'Enter monthly interest rate'}
                placeholderTextColor="#64748B"
                value={form.interest_rate}
                onChangeText={(text) => setForm({ ...form, interest_rate: text })}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.label}>{language === 'et' ? 'Laenu periood (kuud)' : 'Loan Tenure (months)'}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="calendar" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Sisesta kuude arv' : 'Enter number of months'}
                placeholderTextColor="#64748B"
                value={form.loan_tenure_months}
                onChangeText={(text) => setForm({ ...form, loan_tenure_months: text })}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.label}>{language === 'et' ? 'Laenu antud kuupäev' : 'Loan Given Date'}</Text>
            <DatePicker
              value={form.loan_given_date}
              onChange={(date) => setForm({ ...form, loan_given_date: date })}
              placeholder={language === 'et' ? 'Vali kuupäev' : 'Select date'}
              testID="loan-given-date-input"
            />

            <Text style={styles.label}>{t('emiDueDate')}</Text>
            <DatePicker
              value={form.emi_due_date}
              onChange={(date) => setForm({ ...form, emi_due_date: date })}
              placeholder={language === 'et' ? 'Vali kuupäev' : 'Select date'}
              minDate={new Date(Date.now() + 86400000)}
              testID="emi-due-date-input"
            />

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>{t('createClient')}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#3B82F6" />
              <Text style={styles.infoText}>
                {t('registrationCodeInfo')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  form: {
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  currencySymbol: {
    fontSize: 18,
    color: '#64748B',
    marginRight: 8,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 56,
    marginTop: 32,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  // Date Picker styles
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContent: {
    width: '90%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  datePickerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  datePickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  datePickerLabel: {
    fontSize: 16,
    color: '#94A3B8',
    width: 60,
  },
  datePickerSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 16,
  },
  datePickerArrow: {
    padding: 4,
  },
  datePickerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    minWidth: 100,
    textAlign: 'center',
  },
  datePreview: {
    backgroundColor: '#4F46E520',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginVertical: 16,
  },
  datePreviewText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  datePickerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  datePickerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  datePickerCancelButton: {
    backgroundColor: '#334155',
  },
  datePickerConfirmButton: {
    backgroundColor: '#4F46E5',
  },
  datePickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
  
