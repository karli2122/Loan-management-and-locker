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
  Modal,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

const screenWidth = Dimensions.get('window').width;

interface MonthData {
  month: string;
  revenue: number;
  payments_count: number;
  interest_earned?: number;
  principal_collected?: number;
}

export default function Reports() {
  const router = useRouter();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Report data
  const [collectionReport, setCollectionReport] = useState<any>(null);
  const [clientReport, setClientReport] = useState<any>(null);
  const [financialReport, setFinancialReport] = useState<any>(null);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // null = all months
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  // PDF/Export
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const months = language === 'et' 
    ? ['Jaanuar', 'Veebruar', 'Märts', 'Aprill', 'Mai', 'Juuni', 'Juuli', 'August', 'September', 'Oktoober', 'November', 'Detsember']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

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

  // Filter monthly trend by selected year/month
  const getFilteredMonthlyData = (): MonthData[] => {
    if (!financialReport?.monthly_trend) return [];
    
    return financialReport.monthly_trend.filter((m: MonthData) => {
      const [monthName, year] = m.month.split(' ');
      const monthYear = parseInt(year);
      
      if (monthYear !== selectedYear) return false;
      
      if (selectedMonth !== null) {
        const monthIndex = months.findIndex(name => 
          monthName.toLowerCase().startsWith(name.substring(0, 3).toLowerCase())
        );
        if (monthIndex !== selectedMonth) return false;
      }
      
      return true;
    });
  };

  // Calculate profit summary for selected period
  const getProfitSummary = () => {
    const filteredData = getFilteredMonthlyData();
    const totalRevenue = filteredData.reduce((sum, m) => sum + (m.revenue || 0), 0);
    const totalPayments = filteredData.reduce((sum, m) => sum + (m.payments_count || 0), 0);
    
    // Calculate interest earned from financial report
    const interestEarned = financialReport?.totals?.interest_earned || 0;
    const principalCollected = totalRevenue - (interestEarned * (filteredData.length / 6)); // Approximate
    
    return {
      totalRevenue,
      totalPayments,
      interestEarned: interestEarned * (filteredData.length / 6),
      principalCollected,
      profit: interestEarned * (filteredData.length / 6), // Interest is profit
    };
  };

  // Generate PDF report content and share
  const handleExportPdf = async () => {
    setGeneratingPdf(true);
    try {
      const summary = getProfitSummary();
      const filteredData = getFilteredMonthlyData();
      const periodLabel = selectedMonth !== null 
        ? `${months[selectedMonth]} ${selectedYear}`
        : `${selectedYear}`;
      
      // Create a text-based report that can be shared
      let reportContent = `
========================================
${language === 'et' ? 'KASUMIARUANNE' : 'PROFIT REPORT'}
${periodLabel}
========================================

${language === 'et' ? 'KOKKUVÕTE' : 'SUMMARY'}
----------------------------------------
${language === 'et' ? 'Kogutulu' : 'Total Revenue'}: €${summary.totalRevenue.toFixed(2)}
${language === 'et' ? 'Teenitud intress' : 'Interest Earned'}: €${summary.interestEarned.toFixed(2)}
${language === 'et' ? 'Maksete arv' : 'Number of Payments'}: ${summary.totalPayments}
${language === 'et' ? 'Kasum' : 'Profit'}: €${summary.profit.toFixed(2)}

${language === 'et' ? 'IGAKUINE JAOTUS' : 'MONTHLY BREAKDOWN'}
----------------------------------------
`;

      filteredData.forEach((m: MonthData) => {
        reportContent += `${m.month}: €${m.revenue.toFixed(2)} (${m.payments_count} ${language === 'et' ? 'makset' : 'payments'})\n`;
      });

      if (financialReport?.totals) {
        reportContent += `
${language === 'et' ? 'FINANTSÜLEVAADE' : 'FINANCIAL OVERVIEW'}
----------------------------------------
${language === 'et' ? 'Väljastatud põhiosa' : 'Principal Disbursed'}: €${financialReport.totals.principal_disbursed.toFixed(2)}
${language === 'et' ? 'Teenitud intress' : 'Interest Earned'}: €${financialReport.totals.interest_earned.toFixed(2)}
${language === 'et' ? 'Töötlustasud' : 'Processing Fees'}: €${financialReport.totals.processing_fees.toFixed(2)}
${language === 'et' ? 'Viivised' : 'Late Fees'}: €${financialReport.totals.late_fees.toFixed(2)}
${language === 'et' ? 'Kogutulu' : 'Total Revenue'}: €${financialReport.totals.total_revenue.toFixed(2)}
`;
      }

      reportContent += `
----------------------------------------
${language === 'et' ? 'Aruanne koostatud' : 'Report Generated'}: ${new Date().toLocaleString(language === 'et' ? 'et-EE' : 'en-US')}
========================================
`;

      await Share.share({
        message: reportContent,
        title: `${language === 'et' ? 'Kasumiaruanne' : 'Profit Report'} - ${periodLabel}`,
      });

    } catch (error) {
      console.error('Error generating report:', error);
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Aruande koostamine ebaõnnestus' : 'Failed to generate report'
      );
    } finally {
      setGeneratingPdf(false);
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

  const profitSummary = getProfitSummary();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{language === 'et' ? 'Aruanded ja analüütika' : 'Reports & Analytics'}</Text>
        <TouchableOpacity onPress={handleCalculateLateFees} style={styles.refreshButton}>
          <Ionicons name="calculator" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        {/* Period Filter Section */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>{language === 'et' ? 'Periood' : 'Period'}</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={() => setShowYearPicker(true)}
            >
              <Ionicons name="calendar" size={18} color="#4F46E5" />
              <Text style={styles.filterButtonText}>{selectedYear}</Text>
              <Ionicons name="chevron-down" size={16} color="#64748B" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={() => setShowMonthPicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color="#4F46E5" />
              <Text style={styles.filterButtonText}>
                {selectedMonth !== null ? months[selectedMonth] : (language === 'et' ? 'Kõik kuud' : 'All Months')}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
          
          {/* Export PDF Button */}
          <TouchableOpacity 
            style={styles.exportButton}
            onPress={handleExportPdf}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="document-text" size={18} color="#fff" />
                <Text style={styles.exportButtonText}>
                  {language === 'et' ? 'Ekspordi aruanne' : 'Export Report'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Profit Summary for Selected Period */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? 'Kasumi kokkuvõte' : 'Profit Summary'} - {selectedMonth !== null ? months[selectedMonth] : ''} {selectedYear}
          </Text>
          <View style={styles.profitCard}>
            <View style={styles.profitMainRow}>
              <View style={styles.profitMainItem}>
                <Ionicons name="wallet" size={32} color="#10B981" />
                <Text style={styles.profitMainValue}>€{profitSummary.totalRevenue.toFixed(2)}</Text>
                <Text style={styles.profitMainLabel}>{language === 'et' ? 'Kogutulu' : 'Total Revenue'}</Text>
              </View>
              <View style={styles.profitMainItem}>
                <Ionicons name="trending-up" size={32} color="#4F46E5" />
                <Text style={[styles.profitMainValue, { color: '#4F46E5' }]}>€{profitSummary.profit.toFixed(2)}</Text>
                <Text style={styles.profitMainLabel}>{language === 'et' ? 'Kasum (intress)' : 'Profit (Interest)'}</Text>
              </View>
            </View>
            <View style={styles.profitDetailsRow}>
              <View style={styles.profitDetailItem}>
                <Text style={styles.profitDetailLabel}>{language === 'et' ? 'Maksete arv' : 'Payments'}</Text>
                <Text style={styles.profitDetailValue}>{profitSummary.totalPayments}</Text>
              </View>
              <View style={styles.profitDetailItem}>
                <Text style={styles.profitDetailLabel}>{language === 'et' ? 'Intress teenitud' : 'Interest Earned'}</Text>
                <Text style={styles.profitDetailValue}>€{profitSummary.interestEarned.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Collection Report */}
        {collectionReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === 'et' ? 'Kogumise ülevaade' : 'Collection Overview'}</Text>
            
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#4F46E520' }]}>
                <Ionicons name="people" size={24} color="#4F46E5" />
                <Text style={styles.statValue}>{collectionReport.overview?.total_clients || 0}</Text>
                <Text style={styles.statLabel}>{language === 'et' ? 'Kliente kokku' : 'Total Clients'}</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="trending-up" size={24} color="#10B981" />
                <Text style={styles.statValue}>{collectionReport.overview?.active_loans || 0}</Text>
                <Text style={styles.statLabel}>{language === 'et' ? 'Aktiivsed laenud' : 'Active Loans'}</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#EF444420' }]}>
                <Ionicons name="warning" size={24} color="#EF4444" />
                <Text style={styles.statValue}>{collectionReport.overview?.overdue_clients || 0}</Text>
                <Text style={styles.statLabel}>{language === 'et' ? 'Üle tähtaja' : 'Overdue'}</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#F59E0B" />
                <Text style={styles.statValue}>{collectionReport.overview?.completed_loans || 0}</Text>
                <Text style={styles.statLabel}>{language === 'et' ? 'Lõpetatud' : 'Completed'}</Text>
              </View>
            </View>

            <View style={styles.financialCard}>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{language === 'et' ? 'Väljastatud' : 'Disbursed'}</Text>
                <Text style={styles.financialValue}>€{(collectionReport.financial?.total_disbursed || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{language === 'et' ? 'Kogutud' : 'Collected'}</Text>
                <Text style={[styles.financialValue, { color: '#10B981' }]}>
                  €{(collectionReport.financial?.total_collected || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{language === 'et' ? 'Võlgnevus' : 'Outstanding'}</Text>
                <Text style={[styles.financialValue, { color: '#F59E0B' }]}>
                  €{(collectionReport.financial?.total_outstanding || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{language === 'et' ? 'Viivised' : 'Late Fees'}</Text>
                <Text style={[styles.financialValue, { color: '#EF4444' }]}>
                  €{(collectionReport.financial?.total_late_fees || 0).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.financialRow, styles.separator]}>
                <Text style={[styles.financialLabel, { fontWeight: 'bold' }]}>{language === 'et' ? 'Kogumismäär' : 'Collection Rate'}</Text>
                <Text style={[styles.financialValue, { color: '#4F46E5', fontWeight: 'bold' }]}>
                  {collectionReport.financial?.collection_rate || 0}%
                </Text>
              </View>
            </View>

            <View style={styles.monthCard}>
              <Text style={styles.monthTitle}>{language === 'et' ? 'See kuu' : 'This Month'}</Text>
              <View style={styles.monthDetails}>
                <View>
                  <Text style={styles.monthLabel}>{language === 'et' ? 'Kogutud' : 'Collected'}</Text>
                  <Text style={styles.monthValue}>€{(collectionReport.this_month?.total_collected || 0).toFixed(2)}</Text>
                </View>
                <View>
                  <Text style={styles.monthLabel}>{language === 'et' ? 'Makseid' : 'Payments'}</Text>
                  <Text style={styles.monthValue}>{collectionReport.this_month?.number_of_payments || 0}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Client Report */}
        {clientReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === 'et' ? 'Klientide staatus' : 'Client Status Distribution'}</Text>
            
            {/* Pie Chart for Client Status */}
            <View style={styles.chartContainer}>
              <PieChart
                data={[
                  {
                    name: language === 'et' ? 'Õigel ajal' : 'On Time',
                    population: clientReport.summary?.on_time_clients || 0,
                    color: '#10B981',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                  {
                    name: language === 'et' ? 'Ohus' : 'At Risk',
                    population: clientReport.summary?.at_risk_clients || 0,
                    color: '#F59E0B',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                  {
                    name: language === 'et' ? 'Maksejõuetu' : 'Defaulted',
                    population: clientReport.summary?.defaulted_clients || 0,
                    color: '#EF4444',
                    legendFontColor: '#94A3B8',
                    legendFontSize: 12,
                  },
                  {
                    name: language === 'et' ? 'Lõpetatud' : 'Completed',
                    population: clientReport.summary?.completed_clients || 0,
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

            {(clientReport.details?.at_risk?.length || 0) > 0 && (
              <View style={styles.alertBox}>
                <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                <Text style={styles.alertText}>
                  {clientReport.details.at_risk.length} {language === 'et' ? 'klienti vajab tähelepanu' : 'clients need attention'}
                </Text>
              </View>
            )}

            {(clientReport.details?.defaulted?.length || 0) > 0 && (
              <View style={[styles.alertBox, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <Text style={[styles.alertText, { color: '#EF4444' }]}>
                  {clientReport.details.defaulted.length} {language === 'et' ? 'klienti maksejõuetu (>7 päeva)' : 'clients defaulted (>7 days)'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Financial Report */}
        {financialReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === 'et' ? 'Finantside jaotus' : 'Financial Breakdown'}</Text>
            
            <View style={styles.revenueCard}>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{language === 'et' ? 'Põhiosa' : 'Principal'}</Text>
                <Text style={styles.revenueValue}>€{(financialReport.totals?.principal_disbursed || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{language === 'et' ? 'Intress' : 'Interest'}</Text>
                <Text style={[styles.revenueValue, { color: '#10B981' }]}>
                  €{(financialReport.totals?.interest_earned || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{language === 'et' ? 'Töötlustasud' : 'Processing Fees'}</Text>
                <Text style={styles.revenueValue}>€{(financialReport.totals?.processing_fees || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{language === 'et' ? 'Viivised' : 'Late Fees'}</Text>
                <Text style={styles.revenueValue}>€{(financialReport.totals?.late_fees || 0).toFixed(2)}</Text>
              </View>
              <View style={[styles.revenueItem, styles.separator]}>
                <Text style={[styles.revenueLabel, { fontWeight: 'bold' }]}>{language === 'et' ? 'Kogutulu' : 'Total Revenue'}</Text>
                <Text style={[styles.revenueValue, { color: '#4F46E5', fontWeight: 'bold', fontSize: 20 }]}>
                  €{(financialReport.totals?.total_revenue || 0).toFixed(2)}
                </Text>
              </View>
            </View>

            <Text style={styles.trendTitle}>{language === 'et' ? '6-kuu tulude trend' : '6-Month Revenue Trend'}</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={{
                  labels: (financialReport.monthly_trend || []).map((m: any) => {
                    const [month] = (m.month || '').split(' ');
                    return month.substring(0, 3);
                  }),
                  datasets: [
                    {
                      data: (financialReport.monthly_trend || []).map((m: any) => m.revenue || 0),
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
              {(financialReport.monthly_trend || []).map((month: any, index: number) => (
                <View key={index} style={styles.trendSummaryItem}>
                  <Text style={styles.trendSummaryMonth}>{month.month}</Text>
                  <Text style={styles.trendSummaryValue}>€{(month.revenue || 0).toFixed(0)}</Text>
                  <Text style={styles.trendSummaryCount}>{month.payments_count || 0} {language === 'et' ? 'makset' : 'payments'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Year Picker Modal */}
      <Modal visible={showYearPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>{language === 'et' ? 'Vali aasta' : 'Select Year'}</Text>
            <ScrollView style={styles.pickerList}>
              {years.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[styles.pickerItem, selectedYear === year && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedYear(year);
                    setShowYearPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, selectedYear === year && styles.pickerItemTextActive]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCloseButton} onPress={() => setShowYearPicker(false)}>
              <Text style={styles.pickerCloseText}>{language === 'et' ? 'Sulge' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Month Picker Modal */}
      <Modal visible={showMonthPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>{language === 'et' ? 'Vali kuu' : 'Select Month'}</Text>
            <ScrollView style={styles.pickerList}>
              <TouchableOpacity
                style={[styles.pickerItem, selectedMonth === null && styles.pickerItemActive]}
                onPress={() => {
                  setSelectedMonth(null);
                  setShowMonthPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, selectedMonth === null && styles.pickerItemTextActive]}>
                  {language === 'et' ? 'Kõik kuud' : 'All Months'}
                </Text>
              </TouchableOpacity>
              {months.map((month, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.pickerItem, selectedMonth === index && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedMonth(index);
                    setShowMonthPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, selectedMonth === index && styles.pickerItemTextActive]}>
                    {month}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCloseButton} onPress={() => setShowMonthPicker(false)}>
              <Text style={styles.pickerCloseText}>{language === 'et' ? 'Sulge' : 'Close'}</Text>
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
  // Filter section styles
  filterSection: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Profit summary styles
  profitCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
  },
  profitMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  profitMainItem: {
    alignItems: 'center',
  },
  profitMainValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
    marginTop: 8,
  },
  profitMainLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  profitDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  profitDetailItem: {
    alignItems: 'center',
  },
  profitDetailLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  profitDetailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  pickerItemActive: {
    backgroundColor: '#4F46E520',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  pickerItemTextActive: {
    color: '#4F46E5',
    fontWeight: '600',
  },
  pickerCloseButton: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 16,
  },
  pickerCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
});
