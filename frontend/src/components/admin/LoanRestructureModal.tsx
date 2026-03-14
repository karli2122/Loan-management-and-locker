import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ScrollView, Alert, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import API_URL from '../../constants/api';

interface Props {
  clientId: string;
  clientName: string;
  adminToken: string;
  colors: any;
  visible: boolean;
  onClose: () => void;
}

export default function LoanRestructureModal({ clientId, clientName, adminToken, colors, visible, onClose }: Props) {
  const [newEmi, setNewEmi] = useState('');
  const [newTenure, setNewTenure] = useState('');
  const [newRate, setNewRate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (visible) fetchHistory();
  }, [visible]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/loans/${clientId}/restructure-history?admin_token=${adminToken}`);
      if (resp.ok) {
        const data = await resp.json();
        setHistory(data.history || []);
      }
    } catch (e) { console.log(e); }
    setHistoryLoading(false);
  };

  const handleRestructure = async () => {
    if (!reason.trim()) {
      Alert.alert('Error', 'Reason is required');
      return;
    }
    if (!newEmi && !newTenure && !newRate) {
      Alert.alert('Error', 'Please specify at least one change');
      return;
    }
    setLoading(true);
    try {
      const body: any = { reason };
      if (newEmi) body.new_emi = parseFloat(newEmi);
      if (newTenure) body.new_tenure_months = parseInt(newTenure);
      if (newRate) body.new_interest_rate = parseFloat(newRate);

      const resp = await fetch(`${API_URL}/api/loans/${clientId}/restructure?admin_token=${adminToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (resp.ok) {
        Alert.alert('Success', 'Loan restructured successfully');
        setNewEmi(''); setNewTenure(''); setNewRate(''); setReason('');
        fetchHistory();
      } else {
        Alert.alert('Error', data.detail || data.error || 'Failed');
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLoading(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%', padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Loan Restructure</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Form */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 12 }}>Modify Terms</Text>
              
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>New EMI Amount</Text>
              <TextInput value={newEmi} onChangeText={setNewEmi} placeholder="Leave blank to keep current" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad"
                style={{ backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }} />

              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>New Tenure (months)</Text>
              <TextInput value={newTenure} onChangeText={setNewTenure} placeholder="Leave blank to keep current" placeholderTextColor={colors.textMuted} keyboardType="number-pad"
                style={{ backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }} />

              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>New Interest Rate (%)</Text>
              <TextInput value={newRate} onChangeText={setNewRate} placeholder="Leave blank to keep current" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad"
                style={{ backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }} />

              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Reason *</Text>
              <TextInput value={reason} onChangeText={setReason} placeholder="e.g. Client hardship, renegotiation..." placeholderTextColor={colors.textMuted} multiline
                style={{ backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: 12, marginBottom: 16, minHeight: 60, borderWidth: 1, borderColor: colors.border }} />

              <TouchableOpacity onPress={handleRestructure} disabled={loading}
                style={{ backgroundColor: '#2563EB', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Apply Restructure</Text>}
              </TouchableOpacity>
            </View>

            {/* History */}
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>Restructure History ({history.length})</Text>
            {historyLoading ? <ActivityIndicator color="#10B981" /> : history.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 20 }}>No restructurings yet</Text>
            ) : (
              history.map((h, i) => (
                <View key={h.id || i} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>{h.effective_date || ''}</Text>
                  <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{h.reason}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {h.new_terms?.emi_amount != null && (
                      <View style={{ backgroundColor: '#1E3A5F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ color: '#93C5FD', fontSize: 11 }}>EMI: {h.original_terms?.emi_amount} → {h.new_terms.emi_amount}</Text>
                      </View>
                    )}
                    {h.new_terms?.interest_rate != null && (
                      <View style={{ backgroundColor: '#1E3A5F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ color: '#93C5FD', fontSize: 11 }}>Rate: {h.original_terms?.interest_rate}% → {h.new_terms.interest_rate}%</Text>
                      </View>
                    )}
                    {h.new_terms?.tenure_months != null && (
                      <View style={{ backgroundColor: '#1E3A5F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ color: '#93C5FD', fontSize: 11 }}>Tenure: {h.new_terms.tenure_months}m</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
