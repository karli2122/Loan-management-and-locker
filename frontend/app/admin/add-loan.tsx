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

export default function AddLoan() {
  const router = useRouter();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  
  // Client selection
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  
  // Loan details - New fields matching the requirement
  const [loanAmount, setLoanAmount] = useState('');
  const [givenOnDate, setGivenOnDate] = useState(new Date());
  const [loanNumber, setLoanNumber] = useState('');
  const [tags, setTags] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [repaymentType, setRepaymentType] = useState('One-Time Payment');
  const [loanDueDate, setLoanDueDate] = useState(new Date());
  const [showGivenOnPicker, setShowGivenOnPicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [showRepaymentTypePicker, setShowRepaymentTypePicker] = useState(false);

  const repaymentTypes = ['One-Time Payment', 'Installments', 'Monthly EMI', 'Weekly'];

  useEffect(() => {
    fetchClients();
    generateLoanNumber();
    loadAssignedUser();
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

  const generateLoanNumber = () => {
    // Generate a random 4-digit loan number
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    setLoanNumber(randomNumber.toString());
  };

  const loadAssignedUser = async () => {
    // Get current admin name from storage or API
    const adminName = await AsyncStorage.getItem('admin_name');
    if (adminName) {
      setAssignedTo(`${adminName} (You)`);
    } else {
      setAssignedTo('You');
    }
  };

  const filteredClients = clients.filter(c =>
    c && c.name && c.phone && (
      c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      c.phone.includes(clientSearchQuery)
    )
  );

  const formatDate = (date: Date) => {
    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day}${month} ${year}`;
  };

  const handleSubmit = async () => {
    // Validate inputs
    if (!selectedClient) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun vali klient' : 'Please select a client'
      );
      return;
    }

    const loanAmountNum = parseFloat(loanAmount);

    if (!loanAmount.trim() || isNaN(loanAmountNum) || loanAmountNum <= 0) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun sisesta kehtiv laenusumma' : 'Please enter a valid loan amount'
      );
      return;
    }

    setLoading(true);
    try {
      const clientId = selectedClient.id;

      // Setup loan for the client
      const adminId = await AsyncStorage.getItem('admin_id');
      const loanResponse = await fetch(`${API_URL}/api/loans/${clientId}/setup?admin_id=${adminId || ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: loanAmountNum,
          loan_number: loanNumber,
          tags: tags,
          assigned_to: assignedTo,
          repayment_type: repaymentType,
          given_on: givenOnDate.toISOString(),
          loan_due_date: loanDueDate.toISOString(),
          // Default values for backward compatibility
          interest_rate: 0,
          loan_tenure_months: 1,
        }),
      });

      if (!loanResponse.ok) {
        // Try to get error message from response
        let errorMessage = `Failed to setup loan (${loanResponse.status})`;
        try {
          const contentType = loanResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await loanResponse.json();
            errorMessage = errorData?.detail || errorData?.message || errorMessage;
          } else {
            const errorText = await loanResponse.text();
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

      const loanData = await loanResponse.json();
      
      Alert.alert(
        language === 'et' ? 'Õnnestus' : 'Success',
        language === 'et' 
          ? `Laen loodud!\nLaenu number: ${loanNumber}`
          : `Loan created successfully!\nLoan Number: ${loanNumber}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Add loan error:', error);
      let errorMessage = 'Something went wrong';
      
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        // Try to extract message from common error object properties
        errorMessage = error.message || error.detail || error.error || JSON.stringify(error);
      }
      
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
        {/* Name of the client */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {language === 'et' ? 'Kliendi nimi' : 'Name of the client'}
          </Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowClientPicker(true)}
            disabled={loadingClients}
          >
            <Ionicons name="person" size={20} color="#94A3B8" />
            <Text style={styles.pickerButtonText}>
              {selectedClient
                ? selectedClient.name
                : loadingClients
                ? (language === 'et' ? 'Laadimine...' : 'Loading...')
                : (language === 'et' ? 'Vali klient' : 'Select Client')}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Loan Amount */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {language === 'et' ? 'Laenusumma' : 'Loan Amount'}
          </Text>
          <View style={styles.amountContainer}>
            <Text style={styles.currencySymbol}>€</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="200.00"
              placeholderTextColor="#64748B"
              value={loanAmount}
              onChangeText={setLoanAmount}
              keyboardType="decimal-pad"
            />
            <Text style={styles.currencyLabel}>€</Text>
          </View>
        </View>

        {/* Given on */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {language === 'et' ? 'Antud' : 'Given on'}
          </Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowGivenOnPicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#94A3B8" />
            <Text style={styles.dateText}>{formatDate(givenOnDate)}</Text>
          </TouchableOpacity>
        </View>

        {/* Loan Number */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {language === 'et' ? 'Laenu number' : 'Loan Number'}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="document-text-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="1929"
              placeholderTextColor="#64748B"
              value={loanNumber}
              onChangeText={setLoanNumber}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Tags */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {language === 'et' ? 'Sildid' : 'Tags'}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="pricetags-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder={language === 'et' ? 'Sisesta sildid' : 'Enter tags'}
              placeholderTextColor="#64748B"
              value={tags}
              onChangeText={setTags}
            />
          </View>
        </View>

        {/* Assign to */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {language === 'et' ? 'Määratud' : 'Assign to'}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="KarliVilbas (You)"
              placeholderTextColor="#64748B"
              value={assignedTo}
              onChangeText={setAssignedTo}
            />
          </View>
        </View>

        {/* Repayment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? 'Tagasimakse' : 'Repayment'}
          </Text>

          {/* Repayment Type */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {language === 'et' ? 'Tagasimakse tüüp' : 'Repayment Type'}
            </Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowRepaymentTypePicker(true)}
            >
              <Ionicons name="cash-outline" size={20} color="#94A3B8" />
              <Text style={styles.pickerButtonText}>{repaymentType}</Text>
              <Ionicons name="chevron-down" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Loan Due Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {language === 'et' ? 'Laenu tähtaeg' : 'Loan Due Date'}
            </Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDueDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#94A3B8" />
              <Text style={styles.dateText}>{formatDate(loanDueDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Review Loan Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>
                {language === 'et' ? 'Vaata laenu' : 'Review Loan'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
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

      {/* Repayment Type Picker Modal */}
      <Modal visible={showRepaymentTypePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'et' ? 'Vali tagasimakse tüüp' : 'Select Repayment Type'}
              </Text>
              <TouchableOpacity onPress={() => setShowRepaymentTypePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerList}>
              {repaymentTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={styles.pickerItem}
                  onPress={() => {
                    setRepaymentType(type);
                    setShowRepaymentTypePicker(false);
                  }}
                >
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>{type}</Text>
                  </View>
                  {repaymentType === type && (
                    <Ionicons name="checkmark-circle" size={24} color="#4F46E5" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Given On Date Picker Modal */}
      <Modal visible={showGivenOnPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'et' ? 'Vali kuupäev' : 'Select Date'}
              </Text>
              <TouchableOpacity onPress={() => setShowGivenOnPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerInfo}>
              <Text style={styles.datePickerText}>{formatDate(givenOnDate)}</Text>
              <Text style={styles.datePickerHint}>
                {language === 'et' ? 'Praegu valitud kuupäev' : 'Currently selected date'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowGivenOnPicker(false)}
            >
              <Text style={styles.datePickerButtonText}>
                {language === 'et' ? 'Kinnita' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Loan Due Date Picker Modal */}
      <Modal visible={showDueDatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === 'et' ? 'Vali tähtaeg' : 'Select Due Date'}
              </Text>
              <TouchableOpacity onPress={() => setShowDueDatePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerInfo}>
              <Text style={styles.datePickerText}>{formatDate(loanDueDate)}</Text>
              <Text style={styles.datePickerHint}>
                {language === 'et' ? 'Praegu valitud kuupäev' : 'Currently selected date'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDueDatePicker(false)}
            >
              <Text style={styles.datePickerButtonText}>
                {language === 'et' ? 'Kinnita' : 'Confirm'}
              </Text>
            </TouchableOpacity>
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
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
  },
  section: {
    marginBottom: 24,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
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
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: '#CBD5E1',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  currencyLabel: {
    fontSize: 16,
    color: '#94A3B8',
    marginLeft: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dateText: {
    fontSize: 16,
    color: '#fff',
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
    marginTop: 16,
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
  datePickerInfo: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    marginBottom: 16,
  },
  datePickerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  datePickerHint: {
    fontSize: 14,
    color: '#94A3B8',
  },
  datePickerButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  datePickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
