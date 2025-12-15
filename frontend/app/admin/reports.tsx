import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, PieChart } from 'react-native-chart-kit';
import API_URL from '../../src/constants/api';

const screenWidth = Dimensions.get('window').width;

export default function Reports() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Report data
  const [collectionReport, setCollectionReport] = useState<any>(null);
  const [clientReport, setClientReport] = useState<any>(null);
  const [financialReport, setFinancialReport] = useState<any>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const [collection, clients, financial] = await Promise.all([
        fetch(`${API_URL}/api/reports/collection`).then(r => r.json()),
        fetch(`${API_URL}/api/reports/clients`).then(r => r.json()),
        fetch(`${API_URL}/api/reports/financial`).then(r => r.json()),
      ]);
      
      setCollectionReport(collection);
      setClientReport(clients);
      setFinancialReport(financial);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const handleCalculateLateFees = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      await fetch(`${API_URL}/api/late-fees/calculate-all?admin_token=${token}`, {
        method: 'POST',
      });
      fetchReports(); // Refresh data
    } catch (error) {
      console.error('Error calculating late fees:', error);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reports & Analytics</Text>
        <TouchableOpacity onPress={handleCalculateLateFees} style={styles.refreshButton}>
          <Ionicons name="calculator" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        {/* Collection Report */}
        {collectionReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Collection Overview</Text>
            
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#4F46E520' }]}>
                <Ionicons name="people" size={24} color="#4F46E5" />
                <Text style={styles.statValue}>{collectionReport.overview.total_clients}</Text>
                <Text style={styles.statLabel}>Total Clients</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="trending-up" size={24} color="#10B981" />
                <Text style={styles.statValue}>{collectionReport.overview.active_loans}</Text>
                <Text style={styles.statLabel}>Active Loans</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#EF444420' }]}>
                <Ionicons name="warning" size={24} color="#EF4444" />
                <Text style={styles.statValue}>{collectionReport.overview.overdue_clients}</Text>
                <Text style={styles.statLabel}>Overdue</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#F59E0B" />
                <Text style={styles.statValue}>{collectionReport.overview.completed_loans}</Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
            </View>

            <View style={styles.financialCard}>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Disbursed</Text>
                <Text style={styles.financialValue}>€{collectionReport.financial.total_disbursed.toFixed(2)}</Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Collected</Text>
                <Text style={[styles.financialValue, { color: '#10B981' }]}>
                  €{collectionReport.financial.total_collected.toFixed(2)}
                </Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Outstanding</Text>
                <Text style={[styles.financialValue, { color: '#F59E0B' }]}>
                  €{collectionReport.financial.total_outstanding.toFixed(2)}
                </Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Late Fees</Text>
                <Text style={[styles.financialValue, { color: '#EF4444' }]}>
                  €{collectionReport.financial.total_late_fees.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.financialRow, styles.separator]}>
                <Text style={[styles.financialLabel, { fontWeight: 'bold' }]}>Collection Rate</Text>
                <Text style={[styles.financialValue, { color: '#4F46E5', fontWeight: 'bold' }]}>
                  {collectionReport.financial.collection_rate}%
                </Text>
              </View>
            </View>

            <View style={styles.monthCard}>
              <Text style={styles.monthTitle}>This Month</Text>
              <View style={styles.monthDetails}>
                <View>
                  <Text style={styles.monthLabel}>Collected</Text>
                  <Text style={styles.monthValue}>€{collectionReport.this_month.total_collected.toFixed(2)}</Text>
                </View>
                <View>
                  <Text style={styles.monthLabel}>Payments</Text>
                  <Text style={styles.monthValue}>{collectionReport.this_month.number_of_payments}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Client Report */}
        {clientReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Client Status Distribution</Text>
            
            {/* Pie Chart for Client Status */}
            <View style={styles.chartContainer}>
              <PieChart
                data={[
                  {
                    name: 'On Time',
                    population: clientReport.summary.on_time_clients,
                    color: '#10B981',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                  {
                    name: 'At Risk',
                    population: clientReport.summary.at_risk_clients,
                    color: '#F59E0B',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                  {
                    name: 'Defaulted',
                    population: clientReport.summary.defaulted_clients,
                    color: '#EF4444',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                  {
                    name: 'Completed',
                    population: clientReport.summary.completed_clients,
                    color: '#4F46E5',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                ]}
                width={screenWidth - 40}
                height={220}
                chartConfig={{
                  backgroundColor: '#1E293B',
                  backgroundGradientFrom: '#1E293B',
                  backgroundGradientTo: '#1E293B',
                  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
              />
            </View>

            {clientReport.details.at_risk.length > 0 && (
              <View style={styles.alertBox}>
                <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                <Text style={styles.alertText}>
                  {clientReport.details.at_risk.length} clients need attention
                </Text>
              </View>
            )}

            {clientReport.details.defaulted.length > 0 && (
              <View style={[styles.alertBox, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <Text style={[styles.alertText, { color: '#EF4444' }]}>
                  {clientReport.details.defaulted.length} clients defaulted (>7 days)
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Financial Report */}
        {financialReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Financial Breakdown</Text>
            
            <View style={styles.revenueCard}>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>Principal</Text>
                <Text style={styles.revenueValue}>€{financialReport.totals.principal_disbursed.toFixed(2)}</Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>Interest</Text>
                <Text style={[styles.revenueValue, { color: '#10B981' }]}>
                  €{financialReport.totals.interest_earned.toFixed(2)}
                </Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>Processing Fees</Text>
                <Text style={styles.revenueValue}>€{financialReport.totals.processing_fees.toFixed(2)}</Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>Late Fees</Text>
                <Text style={styles.revenueValue}>€{financialReport.totals.late_fees.toFixed(2)}</Text>
              </View>
              <View style={[styles.revenueItem, styles.separator]}>
                <Text style={[styles.revenueLabel, { fontWeight: 'bold' }]}>Total Revenue</Text>
                <Text style={[styles.revenueValue, { color: '#4F46E5', fontWeight: 'bold', fontSize: 20 }]}>
                  €{financialReport.totals.total_revenue.toFixed(2)}
                </Text>
              </View>
            </View>

            <Text style={styles.trendTitle}>6-Month Revenue Trend</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={{
                  labels: financialReport.monthly_trend.map((m: any) => {
                    const [month] = m.month.split(' ');
                    return month.substring(0, 3);
                  }),
                  datasets: [
                    {
                      data: financialReport.monthly_trend.map((m: any) => m.revenue),
                    },
                  ],
                }}
                width={screenWidth - 40}
                height={220}
                chartConfig={{
                  backgroundColor: '#1E293B',
                  backgroundGradientFrom: '#1E293B',
                  backgroundGradientTo: '#334155',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                  propsForDots: {
                    r: '6',
                    strokeWidth: '2',
                    stroke: '#4F46E5',
                  },
                }}
                bezier
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                }}
              />
            </View>

            {/* Trend summary */}
            <View style={styles.trendSummary}>
              {financialReport.monthly_trend.map((month: any, index: number) => (
                <View key={index} style={styles.trendSummaryItem}>
                  <Text style={styles.trendSummaryMonth}>{month.month}</Text>
                  <Text style={styles.trendSummaryValue}>€{month.revenue.toFixed(0)}</Text>
                  <Text style={styles.trendSummaryCount}>{month.payments_count} payments</Text>
                </View>
              ))}
            </View>
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
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
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
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  financialCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  financialLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  financialValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  separator: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    marginTop: 8,
    paddingTop: 12,
  },
  monthCard: {
    backgroundColor: '#4F46E520',
    borderRadius: 12,
    padding: 16,
  },
  monthTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 12,
  },
  monthDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  monthLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  monthValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  clientStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  clientStatItem: {
    alignItems: 'center',
  },
  clientStatBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  clientStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  clientStatLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#F59E0B20',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginBottom: 8,
  },
  alertText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  revenueCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  revenueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  revenueLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 16,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 8,
  },
  trendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    marginTop: 16,
  },
  trendSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  trendSummaryItem: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    flex: 1,
    minWidth: '30%',
  },
  trendSummaryMonth: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
  },
  trendSummaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4F46E5',
    marginBottom: 2,
  },
  trendSummaryCount: {
    fontSize: 10,
    color: '#94A3B8',
  },
});