import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface LoanPlan {
  id: string;
  name: string;
  interest_rate: number;
  min_tenure_months: number;
  max_tenure_months: number;
  description: string;
}

export default function AddLoan() {
  const router = useRouter();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);
  
  // Client selection
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  
  // New client form
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  
  // Loan details
  const [loanPlans, setLoanPlans] = useState<LoanPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<LoanPlan | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [tenure, setTenure] = useState('12');

  useEffect(() => {
    fetchClients();
    fetchLoanPlans();
  }, []);

  const fetchClients = async () => {
    try {
      const adminId = await AsyncStorage.getItem('admin_id');
      const query = adminId ? `?limit=500&admin_id=${adminId}` : '?limit=500';
      const response = await fetch(`${API_URL}/api/clients${query}`);
      if (response.ok) {
        const data = await response.json();
        const clientList = data?.clients || (Array.isArray(data) ? data : []);
        setClients(clientList);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const fetchLoanPlans = async () => {
    try {
      console.log('Fetching loan plans from:', `${API_URL}/api/loan-plans?active_only=true`);
      const response = await fetch(`${API_URL}/api/loan-plans?active_only=true`);
      console.log('Loan plans response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Loan plans fetched:', data.length, 'plans');
        setLoanPlans(data);
      } else {
        console.error('Failed to fetch loan plans:', response.status);
      }
    } catch (error) {
      console.error('Error fetching loan plans:', error);
    } finally {
      setLoadingPlans(false);
    }
  };

  const filteredClients = clients.filter(c =>
    c && c.name && c.phone && (
      c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      c.phone.includes(clientSearchQuery)
    )
  );

  const handlePlanSelect = (plan: LoanPlan) => {
    setSelectedPlan(plan);
    setInterestRate(plan.interest_rate.toString());
    setTenure(plan.min_tenure_months.toString());
    setShowPlanPicker(false);
  };

  const handleSubmit = async () => {
    // Validate inputs
    if (clientMode === 'existing' && !selectedClient) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun vali klient' : 'Please select a client'
      );
      return;
    }

    if (clientMode === 'new') {
      if (!newClientName.trim() || !newClientPhone.trim() || !newClientEmail.trim()) {
        Alert.alert(
          language === 'et' ? 'Viga' : 'Error',
          language === 'et' ? 'Palun täida kõik kliendi väljad' : 'Please fill all client fields'
        );
        return;
      }
    }

    const loanAmountNum = parseFloat(loanAmount);
    const interestRateNum = parseFloat(interestRate);
    const tenureNum = parseInt(tenure, 10);

    if (!loanAmount.trim() || isNaN(loanAmountNum) || loanAmountNum <= 0) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun sisesta kehtiv laenusumma' : 'Please enter a valid loan amount'
      );
      return;
    }

    if (!interestRate.trim() || isNaN(interestRateNum) || interestRateNum < 0) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun sisesta kehtiv intressimäär' : 'Please enter a valid interest rate'
      );
      return;
    }

    if (!tenure.trim() || isNaN(tenureNum) || tenureNum <= 0) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun sisesta kehtiv periood' : 'Please enter a valid tenure'
      );
      return;
    }

    setLoading(true);
    try {
      let clientId = selectedClient?.id;

      // Create new client if needed
      if (clientMode === 'new') {
        const adminId = await AsyncStorage.getItem('admin_id');
        const clientResponse = await fetch(`${API_URL}/api/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newClientName.trim(),
            phone: newClientPhone.trim(),
            email: newClientEmail.trim(),
            admin_id: adminId || null,
          }),
        });

        if (!clientResponse.ok) {
          const errorData = await clientResponse.json().catch(() => ({}));
          const errorMessage = errorData?.detail || errorData?.message || `Failed to create client (${clientResponse.status})`;
          throw new Error(errorMessage);
        }

        const newClient = await clientResponse.json();
        clientId = newClient.id;
      }

      // Setup loan for the client
      const loanResponse = await fetch(`${API_URL}/api/loans/${clientId}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: loanAmountNum,
          interest_rate: interestRateNum,
          loan_tenure_months: tenureNum,
        }),
      });

      if (!loanResponse.ok) {
        const errorData = await loanResponse.json().catch(() => ({}));
        const errorMessage = errorData?.detail || errorData?.message || `Failed to setup loan (${loanResponse.status})`;
        throw new Error(errorMessage);
      }

      const loanData = await loanResponse.json();
      
      const monthlyEmi = loanData?.loan_details?.monthly_emi;
      const emiText = (typeof monthlyEmi === 'number' && !isNaN(monthlyEmi)) 
        ? `€${monthlyEmi.toFixed(2)}` 
        : 'N/A';
      
      Alert.alert(
        language === 'et' ? 'Õnnestus' : 'Success',
        language === 'et' 
          ? `Laen loodud!\nIgakuine makse: ${emiText}`
          : `Loan created successfully!\nMonthly payment: ${emiText}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Add loan error:', error);
      let errorMessage = 'Something went wrong';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (error?.detail) {
        errorMessage = error.detail;
      }
      // For any other object types, keep the generic message
      
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        errorMessage
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {language === 'et' ? 'Lisa laen' : 'Add Loan'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Client Selection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? '1. Vali või loo klient' : '1. Select or Create Client'}
          </Text>

          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[styles.modeButton, clientMode === 'existing' && styles.modeButtonActive]}
              onPress={() => setClientMode('existing')}
            >
              <Ionicons
                name="people"
                size={18}
                color={clientMode === 'existing' ? '#fff' : '#94A3B8'}
              />
              <Text style={[styles.modeButtonText, clientMode === 'existing' && styles.modeButtonTextActive]}>
                {language === 'et' ? 'Olemasolev' : 'Existing'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, clientMode === 'new' && styles.modeButtonActive]}
              onPress={() => setClientMode('new')}
            >
              <Ionicons
                name="person-add"
                size={18}
                color={clientMode === 'new' ? '#fff' : '#94A3B8'}
              />
              <Text style={[styles.modeButtonText, clientMode === 'new' && styles.modeButtonTextActive]}>
                {language === 'et' ? 'Uus' : 'New'}
              </Text>
            </TouchableOpacity>
          </View>

          {clientMode === 'existing' ? (
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowClientPicker(true)}
              disabled={loadingClients}
            >
              <Ionicons name="person" size={20} color="#94A3B8" />
              <Text style={styles.pickerButtonText}>
                {selectedClient
                  ? `${selectedClient.name} (${selectedClient.phone})`
                  : loadingClients
                  ? (language === 'et' ? 'Laadimine...' : 'Loading...')
                  : (language === 'et' ? 'Vali klient' : 'Select Client')}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ) : (
            <View style={styles.newClientForm}>
              <View style={styles.inputContainer}>
                <Ionicons name="person" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={language === 'et' ? 'Nimi' : 'Name'}
                  placeholderTextColor="#64748B"
                  value={newClientName}
                  onChangeText={setNewClientName}
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="call" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={language === 'et' ? 'Telefon' : 'Phone'}
                  placeholderTextColor="#64748B"
                  value={newClientPhone}
                  onChangeText={setNewClientPhone}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="mail" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={language === 'et' ? 'E-post' : 'Email'}
                  placeholderTextColor="#64748B"
                  value={newClientEmail}
                  onChangeText={setNewClientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}
        </View>

        {/* Loan Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? '2. Laenu detailid' : '2. Loan Details'}
          </Text>

          {/* Loan Plan Selector (Optional) */}
          <Text style={styles.label}>
            {language === 'et' ? 'Laenuplaan (valikuline)' : 'Loan Plan (Optional)'}
          </Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowPlanPicker(true)}
            disabled={loadingPlans}
          >
            <Ionicons name="document-text" size={20} color="#94A3B8" />
            <Text style={styles.pickerButtonText}>
              {selectedPlan
                ? selectedPlan.name
                : loadingPlans
                ? (language === 'et' ? 'Laadimine...' : 'Loading...')
                : (language === 'et' ? 'Vali plaan' : 'Select Plan')}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
          </TouchableOpacity>

          <Text style={styles.label}>
            {language === 'et' ? 'Laenusumma (€)' : 'Loan Amount (€)'}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="cash" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#64748B"
              value={loanAmount}
              onChangeText={setLoanAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>
            {language === 'et' ? 'Intressimäär (% aastas)' : 'Interest Rate (% per year)'}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="trending-up" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="10"
              placeholderTextColor="#64748B"
              value={interestRate}
              onChangeText={setInterestRate}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>
            {language === 'et' ? 'Periood (kuud)' : 'Tenure (months)'}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="calendar" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="12"
              placeholderTextColor="#64748B"
              value={tenure}
              onChangeText={setTenure}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>
                {language === 'et' ? 'Loo laen' : 'Create Loan'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Client Picker Modal */}
      <Modal visible={showClientPicker} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'et' ? 'Vali klient' : 'Select Client'}
              </Text>
              <TouchableOpacity onPress={() => setShowClientPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder={language === 'et' ? 'Otsi...' : 'Search...'}
              placeholderTextColor="#64748B"
              value={clientSearchQuery}
              onChangeText={setClientSearchQuery}
            />

            <ScrollView style={styles.pickerList}>
              {filteredClients.map((client) => (
                <TouchableOpacity
                  key={client.id}
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedClient(client);
                    setShowClientPicker(false);
                    setClientSearchQuery('');
                  }}
                >
                  <View style={styles.clientAvatar}>
                    <Text style={styles.clientAvatarText}>
                      {client.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>{client.name}</Text>
                    <Text style={styles.pickerItemSubtext}>{client.phone}</Text>
                  </View>
                  {selectedClient?.id === client.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#4F46E5" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Loan Plan Picker Modal */}
      <Modal visible={showPlanPicker} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'et' ? 'Vali laenuplaan' : 'Select Loan Plan'}
              </Text>
              <TouchableOpacity onPress={() => setShowPlanPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerList}>
              {loanPlans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.pickerItem}
                  onPress={() => handlePlanSelect(plan)}
                >
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>{plan.name}</Text>
                    <Text style={styles.pickerItemSubtext}>
                      {plan.interest_rate}% | {plan.min_tenure_months}-{plan.max_tenure_months} {language === 'et' ? 'kuud' : 'months'}
                    </Text>
                    {plan.description && (
                      <Text style={styles.pickerItemDesc}>{plan.description}</Text>
                    )}
                  </View>
                  {selectedPlan?.id === plan.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#4F46E5" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  newClientForm: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
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
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    marginTop: 8,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  searchInput: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  pickerList: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    marginBottom: 8,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  pickerItemSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  pickerItemDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
