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
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../src/constants/api';
import { getErrorMessage } from '../../src/utils/errorHandler';


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
      const adminId = await AsyncStorage.getItem('admin_id');
      if (!adminId) {
        Alert.alert('Error', 'Admin session not found');
        return;
      }
      const response = await fetch(`${API_URL}/api/loan-plans?admin_id=${adminId}`);
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
        ? `${API_URL}/api/loan-plans/${editingPlan.id}?admin_token=${token}`
        : `${API_URL}/api/loan-plans?admin_token=${token}`;

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
      Alert.alert('Error', getErrorMessage(error, 'Failed to save plan'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (plan: LoanPlan) => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const newActiveState = !plan.is_active;
      
      const response = await fetch(`${API_URL}/api/loan-plans/${plan.id}?admin_token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: plan.name,
          interest_rate: plan.interest_rate,
          min_tenure_months: plan.min_tenure_months,
          max_tenure_months: plan.max_tenure_months,
          processing_fee_percent: plan.processing_fee_percent,
          late_fee_percent: plan.late_fee_percent,
          description: plan.description,
          is_active: newActiveState 
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Toggle error:', errorText);
        throw new Error('Failed to update plan');
      }

      // Update local state immediately for better UX
      setPlans(plans.map(p => p.id === plan.id ? { ...p, is_active: newActiveState } : p));
    } catch (error: any) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to update plan'));
    }
  };

  const handleDeletePlan = (plan: LoanPlan) => {
    Alert.alert(
      'Delete Plan',
      `Are you sure you want to delete "${plan.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('admin_token');
              console.log('Attempting to delete plan:', plan.id, plan.name);
              const response = await fetch(`${API_URL}/api/loan-plans/${plan.id}?admin_token=${token}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
              });
              
              console.log('Delete plan response status:', response.status);
              if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorMessage = `Failed to delete plan (${response.status})`;
                
                if (contentType && contentType.includes('application/json')) {
                  const errorData = await response.json();
                  errorMessage = errorData?.detail || errorMessage;
                  
                  // Check if error is about clients using the plan
                  if (response.status === 400 && errorData?.detail?.includes('client(s) are currently using this plan')) {
                    // Extract number of clients from error message
                    const match = errorData.detail.match(/(\d+) client\(s\)/);
                    const clientCount = match ? match[1] : 'some';
                    
                    // Show option to force delete
                    Alert.alert(
                      'Loan Plan In Use',
                      `${clientCount} client(s) are currently using this plan. Do you want to:\n\n• Cancel and reassign clients first (recommended)\n• Force delete and remove plan reference from clients`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Force Delete',
                          style: 'destructive',
                          onPress: () => handleForceDeletePlan(plan),
                        },
                      ]
                    );
                    return;
                  }
                } else {
                  const errorText = await response.text();
                  console.error('Delete error:', response.status, errorText);
                }
                
                throw new Error(errorMessage);
              }
              
              // Remove from local state immediately for better UX
              setPlans(prevPlans => {
                console.log('Deleting plan from local state:', plan.id, 'Current plans count:', prevPlans.length);
                const filtered = prevPlans.filter(p => {
                  const keep = p.id !== plan.id;
                  if (!keep) {
                    console.log('Filtering out plan:', p.id, p.name);
                  }
                  return keep;
                });
                console.log('After filter, plans count:', filtered.length, 'Filtered out:', prevPlans.length - filtered.length);
                return filtered;
              });
              
              console.log('Plan deletion completed successfully');
              Alert.alert('Success', 'Plan deleted successfully');
            } catch (error: any) {
              // On error, refresh to ensure consistency
              console.error('Delete plan error:', error);
              await fetchPlans();
              Alert.alert('Error', getErrorMessage(error, 'Failed to delete plan'));
            }
          },
        },
      ]
    );
  };

  const handleForceDeletePlan = async (plan: LoanPlan) => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/api/loan-plans/${plan.id}?admin_token=${token}&force=true`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Force delete error:', response.status, errorText);
        throw new Error(`Failed to delete plan (${response.status})`);
      }
      
      const result = await response.json();
      
      // Remove from local state immediately for better UX
      console.log('Force deleting plan from local state:', plan.id);
      setPlans(prevPlans => {
        const filtered = prevPlans.filter(p => p.id !== plan.id);
        console.log('After force delete filter, plans count:', filtered.length);
        return filtered;
      });
      
      const clientsAffected = result.clients_affected || 0;
      const message = clientsAffected > 0 
        ? `Plan deleted successfully. ${clientsAffected} client(s) had their loan plan reference removed.`
        : 'Plan deleted successfully';
      
      Alert.alert('Success', message);
    } catch (error: any) {
      // On error, refresh to ensure consistency
      await fetchPlans();
      Alert.alert('Error', getErrorMessage(error, 'Failed to delete plan'));
    }
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
                    style={[styles.iconButton, { backgroundColor: '#EF444420' }]}
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
                  <Text style={styles.detailLabel}>Monthly Interest Rate</Text>
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
                <Text style={styles.inputLabel}>Monthly Interest Rate (%) *</Text>
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