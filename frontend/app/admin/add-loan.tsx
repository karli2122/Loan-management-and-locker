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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getErrorMessage } from '../../src/utils/errorHandler';

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
  const { clientId } = useLocalSearchParams();
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
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientBirthNumber, setNewClientBirthNumber] = useState('');
  
  // Loan details
  const [loanPlans, setLoanPlans] = useState<LoanPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<LoanPlan | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    fetchClients();
    fetchLoanPlans();
  }, []);

  // Pre-select client if clientId is passed in URL
  useEffect(() => {
    if (clientId && clients.length > 0) {
      const preSelectedClient = clients.find(c => c.id === clientId);
      if (preSelectedClient) {
        setSelectedClient(preSelectedClient);
        setClientMode('existing');
      }
    }
  }, [clientId, clients]);

  const fetchClients = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      const query = adminToken ? `?limit=500&admin_token=${adminToken}` : '?limit=500';
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
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        console.error('Admin token not found');
        return;
      }
      
      console.log('Fetching loan plans from:', `${API_URL}/api/loan-plans?admin_token=${adminToken}`);
      const response = await fetch(`${API_URL}/api/loan-plans?admin_token=${adminToken}`);
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
    // Set default due date based on plan's min tenure
    const defaultDate = new Date();
    defaultDate.setMonth(defaultDate.getMonth() + plan.min_tenure_months);
    setDueDate(defaultDate.toISOString().split('T')[0]);
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

    if (!dueDate) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun vali tähtaeg' : 'Please select a due date'
      );
      return;
    }

    // Validate due date is in the future
    const selectedDate = new Date(dueDate);
    if (selectedDate <= new Date()) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Tähtaeg peab olema tulevikus' : 'Due date must be in the future'
      );
      return;
    }

    setLoading(true);
    try {
      let clientId = selectedClient?.id;

      // Create new client if needed
      if (clientMode === 'new') {
        const adminToken = await AsyncStorage.getItem('admin_token');
        const newClientData = {
          name: newClientName.trim(),
          phone: newClientPhone.trim(),
          email: newClientEmail.trim(),
          address: newClientAddress.trim(),
          birth_number: newClientBirthNumber.trim(),
        };
        
        console.log('Creating new client for loan:', newClientData);
        const clientResponse = await fetch(`${API_URL}/api/clients?admin_token=${adminToken || ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClientData),
        });

        console.log('Client creation response status:', clientResponse.status);
        if (!clientResponse.ok) {
          // Try to get error message from response
          let errorMessage = `Failed to create client (${clientResponse.status})`;
          try {
            const contentType = clientResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await clientResponse.json();
              console.error('Client creation error data:', errorData);
              errorMessage = errorData?.detail || errorData?.message || errorMessage;
            } else {
              const errorText = await clientResponse.text();
              console.error('Client creation error text:', errorText.substring(0, 200));
              // If it's an HTML error page, just use the status code
              if (errorText.toLowerCase().includes('<!doctype') || errorText.toLowerCase().includes('<html')) {
                errorMessage = `Server error (${clientResponse.status}). Please check backend connection.`;
              } else if (errorText && errorText.length < 200) {
                // Only use text if it's short and likely a real error message
                errorMessage = errorText;
              }
            }
          } catch (parseError) {
            console.error('Error parsing error response:', parseError);
          }
          throw new Error(errorMessage);
        }

        const newClient = await clientResponse.json();
        console.log('New client created successfully:', newClient.id);
        clientId = newClient.id;
      }

      // Setup loan for the client
      const adminToken = await AsyncStorage.getItem('admin_token');
      const loanData = {
        loan_amount: loanAmountNum,
        interest_rate: interestRateNum,
        due_date: dueDate,
        down_payment: 0,
      };
      
      console.log('Setting up loan for client:', clientId, loanData);
      const loanResponse = await fetch(`${API_URL}/api/loans/${clientId}/setup?admin_token=${adminToken || ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanData),
      });

      console.log('Loan setup response status:', loanResponse.status);
      if (!loanResponse.ok) {
        // Try to get error message from response
        let errorMessage = `Failed to setup loan (${loanResponse.status})`;
        try {
          const contentType = loanResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await loanResponse.json();
            console.error('Loan setup error data:', errorData);
            errorMessage = errorData?.detail || errorData?.message || errorMessage;
          } else {
            const errorText = await loanResponse.text();
            console.error('Loan setup error text:', errorText.substring(0, 200));
            // If it's an HTML error page, just use the status code
            if (errorText.toLowerCase().includes('<!doctype') || errorText.toLowerCase().includes('<html')) {
              errorMessage = `Server error (${loanResponse.status}). Please check backend connection.`;
            } else if (errorText && errorText.length < 200) {
              // Only use text if it's short and likely a real error message
              errorMessage = errorText;
            }
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const loanResponseData = await loanResponse.json();
      console.log('Loan setup successful:', loanResponseData);
      
      const monthlyEmi = loanResponseData?.loan_details?.monthly_emi;
      const tenureMonths = loanResponseData?.loan_details?.tenure_months;
      const emiText = (typeof monthlyEmi === 'number' && !isNaN(monthlyEmi)) 
        ? `€${monthlyEmi.toFixed(2)}` 
        : 'N/A';
      const tenureText = tenureMonths ? `${tenureMonths} ${language === 'et' ? 'kuud' : 'months'}` : '';
      
      Alert.alert(
        language === 'et' ? 'Õnnestus' : 'Success',
        language === 'et' 
          ? `Laen loodud!\nIgakuine makse: ${emiText}${tenureText ? `\nPeriood: ${tenureText}` : ''}`
          : `Loan created successfully!\nMonthly payment: ${emiText}${tenureText ? `\nTenure: ${tenureText}` : ''}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      const errorMessage = getErrorMessage(error, 'Failed to add loan. Please try again.');
      console.error('Add loan error:', error);
      
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
              style={[styles.pickerButton, { marginBottom: 16 }]}
              onPress={() => setShowClientPicker(true)}
              disabled={loadingClients}
              data-testid="select-client-picker"
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
              <View style={styles.inputContainer}>
                <Ionicons name="location" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={language === 'et' ? 'Aadress' : 'Address'}
                  placeholderTextColor="#64748B"
                  value={newClientAddress}
                  onChangeText={setNewClientAddress}
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="card" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={language === 'et' ? 'Isikukood' : 'Birth Number'}
                  placeholderTextColor="#64748B"
                  value={newClientBirthNumber}
                  onChangeText={setNewClientBirthNumber}
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
            style={[styles.pickerButton, { marginBottom: 16 }]}
            onPress={() => setShowPlanPicker(true)}
            disabled={loadingPlans}
            data-testid="select-plan-picker"
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
            {language === 'et' ? 'Tähtaeg' : 'Due Date'}
          </Text>
          {Platform.OS === 'web' ? (
            <View style={styles.inputContainer}>
              <Ionicons name="calendar" size={20} color="#64748B" />
              <input
                type="date"
                value={dueDate}
                onChange={(e: any) => setDueDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                style={{
                  flex: 1,
                  fontSize: 16,
                  color: '#fff',
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  colorScheme: 'dark',
                }}
                data-testid="due-date-input"
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.inputContainer}
              onPress={() => {
                // Fallback for native: set a default date 12 months from now
                if (!dueDate) {
                  const defaultDate = new Date();
                  defaultDate.setMonth(defaultDate.getMonth() + 12);
                  setDueDate(defaultDate.toISOString().split('T')[0]);
                }
              }}
            >
              <Ionicons name="calendar" size={20} color="#64748B" />
              <Text style={{ flex: 1, fontSize: 16, color: dueDate ? '#fff' : '#64748B' }}>
                {dueDate || (language === 'et' ? 'Vali kuupäev' : 'Select date')}
              </Text>
            </TouchableOpacity>
          )}
          {dueDate && (
            <Text style={styles.dueDateInfo} data-testid="due-date-info">
              {(() => {
                const now = new Date();
                const due = new Date(dueDate);
                const diffMonths = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
                return language === 'et'
                  ? `~${Math.max(1, diffMonths)} kuud`
                  : `~${Math.max(1, diffMonths)} months`;
              })()}
            </Text>
          )}
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
        <View style={styles.modalOverlay}>
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
        </View>
      </Modal>

      {/* Loan Plan Picker Modal */}
      <Modal visible={showPlanPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
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
