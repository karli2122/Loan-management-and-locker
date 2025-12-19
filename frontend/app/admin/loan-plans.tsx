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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getApiUrl, API_BASE_URL } from '../../src/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';


interface LoanPlan {
  id: string;
  name: string;
  interest_rate: number;
  min_tenure_months: number;
  max_tenure_months: number;
  processing_fee_percent: number;
  late_fee_percent: number;
  description: string;
  is_active: boolean;
  created_at: string;
}

export default function LoanPlans() {
  const router = useRouter();
  const [plans, setPlans] = useState<LoanPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LoanPlan | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [minTenure, setMinTenure] = useState('3');
  const [maxTenure, setMaxTenure] = useState('24');
  const [processingFee, setProcessingFee] = useState('0');
  const [lateFee, setLateFee] = useState('2');
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/loan-plans`);
      const data = await response.json();
      setPlans(data);
    } catch (error) {
      console.error('Error fetching plans:', error);
      Alert.alert('Error', 'Failed to load loan plans');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setInterestRate('10');
    setMinTenure('3');
    setMaxTenure('24');
    setProcessingFee('0');
    setLateFee('2');
    setDescription('');
    setShowModal(true);
  };

  const openEditModal = (plan: LoanPlan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setInterestRate(plan.interest_rate.toString());
    setMinTenure(plan.min_tenure_months.toString());
    setMaxTenure(plan.max_tenure_months.toString());
    setProcessingFee(plan.processing_fee_percent.toString());
    setLateFee(plan.late_fee_percent.toString());
    setDescription(plan.description);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter plan name');
      return;
    }

    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const planData = {
        name: name.trim(),
        interest_rate: parseFloat(interestRate),
        min_tenure_months: parseInt(minTenure),
        max_tenure_months: parseInt(maxTenure),
        processing_fee_percent: parseFloat(processingFee),
        late_fee_percent: parseFloat(lateFee),
        description: description.trim(),
      };

      const url = editingPlan
        ? `${API_BASE_URL}/api/loan-plans/${editingPlan.id}?admin_token=${token}`
        : `${API_BASE_URL}/api/loan-plans?admin_token=${token}`;

      const response = await fetch(url, {
        method: editingPlan ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planData),
      });

      if (!response.ok) throw new Error('Failed to save plan');

      Alert.alert('Success', `Plan ${editingPlan ? 'updated' : 'created'} successfully`);
      setShowModal(false);
      fetchPlans();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (plan: LoanPlan) => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      
      if (plan.is_active) {
        // Deactivate
        const response = await fetch(`${API_BASE_URL}/api/loan-plans/${plan.id}?admin_token=${token}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to deactivate plan');
      } else {
        // Reactivate by updating
        const response = await fetch(`${API_BASE_URL}/api/loan-plans/${plan.id}?admin_token=${token}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...plan, is_active: true }),
        });
        if (!response.ok) throw new Error('Failed to activate plan');
      }

      fetchPlans();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeletePlan = (plan: LoanPlan) => {
    Alert.alert(
      'Delete Loan Plan',
      `Are you sure you want to permanently delete "${plan.name}"?\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('admin_token');
              const response = await fetch(
                `${API_BASE_URL}/api/loan-plans/${plan.id}?admin_token=${token}&permanent=true`,
                { method: 'DELETE' }
              );
              
              const data = await response.json();
              
              if (!response.ok) {
                throw new Error(data.detail || 'Failed to delete plan');
              }
              
              Alert.alert('Success', 'Loan plan deleted successfully');
              fetchPlans();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loan Plans</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {plans.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#64748B" />
            <Text style={styles.emptyText}>No loan plans yet</Text>
            <Text style={styles.emptySubtext}>Create your first plan to get started</Text>
          </View>
        ) : (
          plans.map((plan) => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.planTitleRow}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {!plan.is_active && (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>Inactive</Text>
                    </View>
                  )}
                </View>
                <View style={styles.planActions}>
                  <TouchableOpacity
                    onPress={() => openEditModal(plan)}
                    style={styles.iconButton}
                  >
                    <Ionicons name="create-outline" size={20} color="#4F46E5" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleToggleActive(plan)}
                    style={styles.iconButton}
                  >
                    <Ionicons
                      name={plan.is_active ? "toggle" : "toggle-outline"}
                      size={20}
                      color={plan.is_active ? "#10B981" : "#64748B"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeletePlan(plan)}
                    style={styles.iconButton}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>

              {plan.description && (
                <Text style={styles.planDescription}>{plan.description}</Text>
              )}

              <View style={styles.planDetails}>
                <View style={styles.detailItem}>
                  <Ionicons name="trending-up" size={16} color="#4F46E5" />
                  <Text style={styles.detailLabel}>Interest Rate</Text>
                  <Text style={styles.detailValue}>{plan.interest_rate}%</Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons name="calendar" size={16} color="#10B981" />
                  <Text style={styles.detailLabel}>Tenure</Text>
                  <Text style={styles.detailValue}>
                    {plan.min_tenure_months}-{plan.max_tenure_months} months
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons name="receipt" size={16} color="#F59E0B" />
                  <Text style={styles.detailLabel}>Processing Fee</Text>
                  <Text style={styles.detailValue}>{plan.processing_fee_percent}%</Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons name="warning" size={16} color="#EF4444" />
                  <Text style={styles.detailLabel}>Late Fee</Text>
                  <Text style={styles.detailValue}>{plan.late_fee_percent}%/month</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingPlan ? 'Edit Plan' : 'Create Loan Plan'}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Plan Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Standard Plan"
                  placeholderTextColor="#64748B"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Interest Rate (% per year) *</Text>
                <TextInput
                  style={styles.input}
                  value={interestRate}
                  onChangeText={setInterestRate}
                  placeholder="10"
                  keyboardType="decimal-pad"
                  placeholderTextColor="#64748B"
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, styles.halfInput]}>
                  <Text style={styles.inputLabel}>Min Tenure (months) *</Text>
                  <TextInput
                    style={styles.input}
                    value={minTenure}
                    onChangeText={setMinTenure}
                    placeholder="3"
                    keyboardType="number-pad"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={[styles.inputGroup, styles.halfInput]}>
                  <Text style={styles.inputLabel}>Max Tenure (months) *</Text>
                  <TextInput
                    style={styles.input}
                    value={maxTenure}
                    onChangeText={setMaxTenure}
                    placeholder="24"
                    keyboardType="number-pad"
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, styles.halfInput]}>
                  <Text style={styles.inputLabel}>Processing Fee (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={processingFee}
                    onChangeText={setProcessingFee}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={[styles.inputGroup, styles.halfInput]}>
                  <Text style={styles.inputLabel}>Late Fee (%/month)</Text>
                  <TextInput
                    style={styles.input}
                    value={lateFee}
                    onChangeText={setLateFee}
                    placeholder="2"
                    keyboardType="decimal-pad"
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Best for short-term loans..."
                  placeholderTextColor="#64748B"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirmButton]}
                  onPress={handleSave}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>
                      {editingPlan ? 'Update' : 'Create'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
  },
  planCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  inactiveBadge: {
    backgroundColor: '#64748B20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  planActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDescription: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  planDetails: {
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '85%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#334155',
  },
  modalConfirmButton: {
    backgroundColor: '#4F46E5',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
