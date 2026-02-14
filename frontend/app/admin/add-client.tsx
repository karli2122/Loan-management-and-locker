import React, { useState, useEffect } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getAuthInfo, handleAuthFailure } from '../../src/utils/adminAuth';


export default function AddClient() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [userCredits, setUserCredits] = useState<number>(5);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    emi_amount: '',
    emi_due_date: '',
  });

  // Date picker state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const token = await AsyncStorage.getItem('admin_token');
        if (token) {
          const response = await fetch(`${API_URL}/api/admin/credits?admin_token=${token}`);
          if (response.ok) {
            const data = await response.json();
            setUserCredits(data.credits);
            setIsSuperAdmin(data.is_super_admin);
          }
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    };
    fetchCredits();
  }, []);

  const months = language === 'et' 
    ? ['Jaanuar', 'Veebruar', 'Märts', 'Aprill', 'Mai', 'Juuni', 'Juuli', 'August', 'September', 'Oktoober', 'November', 'Detsember']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const handleDateSelect = () => {
    const formattedDate = `${String(selectedDay).padStart(2, '0')}/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;
    setForm({ ...form, emi_due_date: formattedDate });
    setShowDatePicker(false);
  };

  const openDatePicker = () => {
    // Parse existing date if any
    if (form.emi_due_date) {
      const parts = form.emi_due_date.split('/');
      if (parts.length === 3) {
        setSelectedDay(parseInt(parts[0]) || new Date().getDate());
        setSelectedMonth((parseInt(parts[1]) || 1) - 1);
        setSelectedYear(parseInt(parts[2]) || new Date().getFullYear());
      }
    }
    setShowDatePicker(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    // Credit check for non-superadmin users
    if (!isSuperAdmin && userCredits <= 0) {
      Alert.alert(
        language === 'et' ? 'Krediidid puuduvad' : 'No Credits',
        language === 'et' 
          ? 'Teil pole krediite seadme registreerimiseks. Palun pöörduge peaadmini poole.'
          : 'You have no credits to register a device. Please contact the superadmin.',
        [{ text: 'OK' }]
      );
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
        emi_amount: parseFloat(form.emi_amount) || 0,
        emi_due_date: form.emi_due_date || undefined,
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
        `${t('clientCreated')}\n\n${t('registrationCode')}: ${client.registration_code}\n\n${t('shareCodeMessage')}`,
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

            <Text style={styles.label}>{t('emiDueDate')}</Text>
            <TouchableOpacity style={styles.inputContainer} onPress={openDatePicker}>
              <Ionicons name="calendar" size={20} color="#64748B" style={styles.inputIcon} />
              <Text style={[styles.input, { paddingVertical: 18 }, !form.emi_due_date && { color: '#64748B' }]}>
                {form.emi_due_date || 'DD/MM/YYYY'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#64748B" />
            </TouchableOpacity>

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

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerContent}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>
                {language === 'et' ? 'Vali kuupäev' : 'Select Date'}
              </Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Year Selector */}
            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>{language === 'et' ? 'Aasta' : 'Year'}</Text>
              <View style={styles.datePickerSelector}>
                <TouchableOpacity 
                  style={styles.datePickerArrow}
                  onPress={() => setSelectedYear(selectedYear - 1)}
                >
                  <Ionicons name="chevron-back" size={20} color="#4F46E5" />
                </TouchableOpacity>
                <Text style={styles.datePickerValue}>{selectedYear}</Text>
                <TouchableOpacity 
                  style={styles.datePickerArrow}
                  onPress={() => setSelectedYear(selectedYear + 1)}
                >
                  <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Month Selector */}
            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>{language === 'et' ? 'Kuu' : 'Month'}</Text>
              <View style={styles.datePickerSelector}>
                <TouchableOpacity 
                  style={styles.datePickerArrow}
                  onPress={() => setSelectedMonth(selectedMonth === 0 ? 11 : selectedMonth - 1)}
                >
                  <Ionicons name="chevron-back" size={20} color="#4F46E5" />
                </TouchableOpacity>
                <Text style={styles.datePickerValue}>{months[selectedMonth]}</Text>
                <TouchableOpacity 
                  style={styles.datePickerArrow}
                  onPress={() => setSelectedMonth(selectedMonth === 11 ? 0 : selectedMonth + 1)}
                >
                  <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Day Selector */}
            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>{language === 'et' ? 'Päev' : 'Day'}</Text>
              <View style={styles.datePickerSelector}>
                <TouchableOpacity 
                  style={styles.datePickerArrow}
                  onPress={() => setSelectedDay(selectedDay === 1 ? getDaysInMonth(selectedYear, selectedMonth) : selectedDay - 1)}
                >
                  <Ionicons name="chevron-back" size={20} color="#4F46E5" />
                </TouchableOpacity>
                <Text style={styles.datePickerValue}>{selectedDay}</Text>
                <TouchableOpacity 
                  style={styles.datePickerArrow}
                  onPress={() => setSelectedDay(selectedDay >= getDaysInMonth(selectedYear, selectedMonth) ? 1 : selectedDay + 1)}
                >
                  <Ionicons name="chevron-forward" size={20} color="#4F46E5" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Selected Date Preview */}
            <View style={styles.datePreview}>
              <Text style={styles.datePreviewText}>
                {`${String(selectedDay).padStart(2, '0')}/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`}
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.datePickerButtons}>
              <TouchableOpacity
                style={[styles.datePickerButton, styles.datePickerCancelButton]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.datePickerButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.datePickerButton, styles.datePickerConfirmButton]}
                onPress={handleDateSelect}
              >
                <Text style={styles.datePickerButtonText}>
                  {language === 'et' ? 'Kinnita' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  
