import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import API_URL from '../../src/constants/api';


export default function Calculator() {
  const router = useRouter();
  const [principal, setPrincipal] = useState('1000');
  const [rate, setRate] = useState('10');
  const [months, setMonths] = useState('12');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/calculator/compare?principal=${principal}&annual_rate=${rate}&months=${months}`
      );
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Calculation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderMethod = (method: any, color: string) => (
    <View style={[styles.methodCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <View style={styles.methodHeader}>
        <Text style={styles.methodName}>{method.method}</Text>
        {method.is_cheapest && (
          <View style={styles.bestBadge}>
            <Ionicons name="star" size={12} color="#10B981" />
            <Text style={styles.bestBadgeText}>Best</Text>
          </View>
        )}
      </View>
      
      <View style={styles.methodDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Monthly Payment</Text>
          <Text style={styles.detailValue}>€{method.monthly_emi}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total Payment</Text>
          <Text style={styles.detailValue}>€{method.total_amount}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Interest</Text>
          <Text style={[styles.detailValue, { color: '#F59E0B' }]}>
            €{method.total_interest}
          </Text>
        </View>
        {method.savings_vs_highest > 0 && (
          <View style={styles.savingsRow}>
            <Ionicons name="trending-down" size={16} color="#10B981" />
            <Text style={styles.savingsText}>
              Saves €{method.savings_vs_highest} vs most expensive
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Loan Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Loan Details</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Principal Amount (€)</Text>
            <TextInput
              style={styles.input}
              value={principal}
              onChangeText={setPrincipal}
              keyboardType="decimal-pad"
              placeholderTextColor="#64748B"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Annual Interest Rate (%)</Text>
            <TextInput
              style={styles.input}
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholderTextColor="#64748B"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Tenure (Months)</Text>
            <TextInput
              style={styles.input}
              value={months}
              onChangeText={setMonths}
              keyboardType="number-pad"
              placeholderTextColor="#64748B"
            />
          </View>

          <TouchableOpacity
            style={styles.calculateButton}
            onPress={handleCalculate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="calculator" size={20} color="#fff" />
                <Text style={styles.calculateButtonText}>Calculate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {results && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>Comparison Results</Text>
            {renderMethod(results.simple_interest, '#F59E0B')}
            {renderMethod(results.reducing_balance, '#10B981')}
            {renderMethod(results.flat_rate, '#EF4444')}
          </View>
        )}
      </ScrollView>
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
  content: {
    flex: 1,
    padding: 20,
  },
  inputSection: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
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
  calculateButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  calculateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  resultsSection: {
    marginBottom: 20,
  },
  methodCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  methodName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  bestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bestBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  methodDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#10B98110',
    borderRadius: 6,
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
});