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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
      const adminId = await AsyncStorage.getItem('admin_token');
      if (!adminId) {
        console.error('Admin ID not found');
        return;
      }
      
      const [collection, clients, financial] = await Promise.all([
        fetch(`${API_URL}/api/reports/collection?admin_token=${adminId}`).then(r => r.json()),
        fetch(`${API_URL}/api/reports/clients?admin_token=${adminId}`).then(r => r.json()),
        fetch(`${API_URL}/api/reports/financial?admin_token=${adminId}`).then(r => r.json()),
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
    const principalDisbursed = financialReport?.totals?.principal_disbursed || 0;
    const principalCollected = totalRevenue - (interestEarned * (filteredData.length / 6)); // Approximate
    
    // Calculate ROI (Return on Investment) = (Profit / Investment) * 100
    const roi = principalDisbursed > 0 ? ((interestEarned / principalDisbursed) * 100) : 0;
    
    return {
      totalRevenue,
      totalPayments,
      interestEarned: interestEarned * (filteredData.length / 6),
      principalCollected,
      profit: interestEarned * (filteredData.length / 6), // Interest is profit
      roi,
    };
  };

  // Calculate advanced metrics
  const getAdvancedMetrics = () => {
    const totalClients = collectionReport?.overview?.total_clients || 0;
    const activeLoans = collectionReport?.overview?.active_loans || 0;
    const completedLoans = collectionReport?.overview?.completed_loans || 0;
    const overdueClients = collectionReport?.overview?.overdue_clients || 0;
    const defaultedClients = clientReport?.summary?.defaulted_clients || 0;
    
    // Strike rate = (Completed loans / Total loans given) * 100
    const totalLoansGiven = activeLoans + completedLoans;
    const strikeRate = totalLoansGiven > 0 ? ((completedLoans / totalLoansGiven) * 100) : 0;
    
    // Bad loans = defaulted clients (overdue > 7 days)
    const badLoansCount = defaultedClients;
    const badLoansAmount = clientReport?.details?.defaulted?.reduce(
      (sum: number, c: any) => sum + (c.outstanding_balance || 0), 0
    ) || 0;
    
    // New loans/customers this month
    const newCustomersThisMonth = clientReport?.summary?.new_clients_this_month || 0;
    const newLoansThisMonth = collectionReport?.this_month?.new_loans || 0;
    
    // Repeat customers = customers with more than 1 loan / total customers
    const repeatCustomers = clientReport?.summary?.repeat_customers || 0;
    const repeatRate = totalClients > 0 ? ((repeatCustomers / totalClients) * 100) : 0;
    
    return {
      strikeRate,
      badLoansCount,
      badLoansAmount,
      newCustomersThisMonth,
      newLoansThisMonth,
      repeatCustomers,
      repeatRate,
    };
  };

  // Generate PDF report content and share
  const handleExportPdf = async () => {
    setGeneratingPdf(true);
    try {
      // Get current user info
      const adminId = await AsyncStorage.getItem('admin_id');
      const adminUsername = await AsyncStorage.getItem('admin_username') || 'Admin User';
      
      const summary = getProfitSummary();
      const filteredData = getFilteredMonthlyData();
      const periodLabel = selectedMonth !== null 
        ? `${months[selectedMonth]} ${selectedYear}`
        : `${selectedYear}`;
      
      // Build monthly breakdown HTML
      let monthlyBreakdownHtml = '';
      filteredData.forEach((m: MonthData) => {
        monthlyBreakdownHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${m.month}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">€${m.revenue.toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${m.payments_count}</td>
          </tr>
        `;
      });

      // Create HTML content for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${language === 'et' ? 'Kasumiaruanne' : 'Profit Report'}</title>
            <style>
              body {
                font-family: 'Helvetica', 'Arial', sans-serif;
                padding: 40px;
                color: #1e293b;
              }
              .header {
                text-align: center;
                margin-bottom: 40px;
                border-bottom: 2px solid #4F46E5;
                padding-bottom: 20px;
              }
              .header h1 {
                color: #4F46E5;
                margin: 0;
                font-size: 28px;
              }
              .header p {
                color: #64748b;
                margin: 10px 0 0 0;
                font-size: 16px;
              }
              .user-info {
                text-align: right;
                margin-bottom: 20px;
                padding: 15px;
                background: #f8fafc;
                border-radius: 8px;
                border-left: 4px solid #4F46E5;
              }
              .user-info p {
                margin: 5px 0;
                color: #64748b;
                font-size: 14px;
              }
              .user-info .label {
                font-weight: 600;
                color: #1e293b;
              }
              .summary-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 40px;
              }
              .summary-card {
                background: #f8fafc;
                padding: 20px;
                border-radius: 8px;
                border-left: 4px solid #4F46E5;
              }
              .summary-card.profit {
                border-left-color: #10B981;
              }
              .summary-card h3 {
                margin: 0 0 8px 0;
                color: #64748b;
                font-size: 14px;
                font-weight: 500;
              }
              .summary-card .value {
                font-size: 24px;
                font-weight: bold;
                color: #1e293b;
              }
              .summary-card.profit .value {
                color: #10B981;
              }
              .section {
                margin-bottom: 30px;
              }
              .section h2 {
                color: #1e293b;
                font-size: 18px;
                margin-bottom: 16px;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 8px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th {
                background: #4F46E5;
                color: white;
                padding: 12px 8px;
                text-align: left;
              }
              th:nth-child(2), th:nth-child(3) {
                text-align: right;
              }
              th:nth-child(3) {
                text-align: center;
              }
              .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
              }
              .totals-row {
                background: #f8fafc;
              }
              .totals-row td {
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${language === 'et' ? 'KASUMIARUANNE' : 'PROFIT REPORT'}</h1>
              <p>${periodLabel}</p>
            </div>

            <div class="user-info">
              <p><span class="label">${language === 'et' ? 'Koostaja:' : 'Generated by:'}</span> ${adminUsername}</p>
              <p><span class="label">${language === 'et' ? 'Kuupäev:' : 'Date:'}</span> ${new Date().toLocaleString(language === 'et' ? 'et-EE' : 'en-US')}</p>
            </div>

            <div class="summary-grid">
              <div class="summary-card">
                <h3>${language === 'et' ? 'Kogutulu' : 'Total Revenue'}</h3>
                <div class="value">€${summary.totalRevenue.toFixed(2)}</div>
              </div>
              <div class="summary-card profit">
                <h3>${language === 'et' ? 'Kasum (intress)' : 'Profit (Interest)'}</h3>
                <div class="value">€${summary.profit.toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>${language === 'et' ? 'Teenitud intress' : 'Interest Earned'}</h3>
                <div class="value">€${summary.interestEarned.toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>${language === 'et' ? 'Maksete arv' : 'Number of Payments'}</h3>
                <div class="value">${summary.totalPayments}</div>
              </div>
            </div>

            ${filteredData.length > 0 ? `
              <div class="section">
                <h2>${language === 'et' ? 'Igakuine jaotus' : 'Monthly Breakdown'}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>${language === 'et' ? 'Kuu' : 'Month'}</th>
                      <th style="text-align: right;">${language === 'et' ? 'Tulu' : 'Revenue'}</th>
                      <th style="text-align: center;">${language === 'et' ? 'Maksed' : 'Payments'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${monthlyBreakdownHtml}
                  </tbody>
                </table>
              </div>
            ` : ''}

            ${financialReport?.totals ? `
              <div class="section">
                <h2>${language === 'et' ? 'Finantsülevaade' : 'Financial Overview'}</h2>
                <table>
                  <tbody>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${language === 'et' ? 'Väljastatud põhiosa' : 'Principal Disbursed'}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">€${financialReport.totals.principal_disbursed.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${language === 'et' ? 'Teenitud intress' : 'Interest Earned'}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #10B981;">€${financialReport.totals.interest_earned.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${language === 'et' ? 'Töötlustasud' : 'Processing Fees'}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">€${financialReport.totals.processing_fees.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${language === 'et' ? 'Viivised' : 'Late Fees'}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">€${financialReport.totals.late_fees.toFixed(2)}</td>
                    </tr>
                    <tr class="totals-row">
                      <td style="padding: 12px 8px;">${language === 'et' ? 'Kogutulu' : 'Total Revenue'}</td>
                      <td style="padding: 12px 8px; text-align: right; color: #4F46E5; font-size: 18px;">€${financialReport.totals.total_revenue.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ` : ''}

            <div class="footer">
              <p>${language === 'et' ? 'Laenuhaldussüsteem' : 'Loan Management System'} &copy; ${new Date().getFullYear()}</p>
            </div>
          </body>
        </html>
      `;

      // Generate PDF file
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      // Share the PDF file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${language === 'et' ? 'Kasumiaruanne' : 'Profit Report'} - ${periodLabel}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          language === 'et' ? 'Valmis' : 'Ready',
          language === 'et' ? `PDF salvestatud: ${uri}` : `PDF saved: ${uri}`
        );
      }

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
  const advancedMetrics = getAdvancedMetrics();

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
              <View style={styles.profitDetailItem}>
                <Text style={styles.profitDetailLabel}>{language === 'et' ? 'ROI' : 'ROI'}</Text>
                <Text style={[styles.profitDetailValue, { color: '#10B981' }]}>{profitSummary.roi.toFixed(1)}%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Advanced Metrics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? 'Täiendavad näitajad' : 'Advanced Metrics'}
          </Text>
          <View style={styles.metricsGrid}>
            {/* Strike Rate */}
            <View style={[styles.metricCard, { backgroundColor: '#10B98120' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="checkmark-done-circle" size={24} color="#10B981" />
                <Text style={[styles.metricValue, { color: '#10B981' }]}>{advancedMetrics.strikeRate.toFixed(1)}%</Text>
              </View>
              <Text style={styles.metricLabel}>{language === 'et' ? 'Edukusmäär' : 'Strike Rate'}</Text>
            </View>

            {/* Repeat Customers */}
            <View style={[styles.metricCard, { backgroundColor: '#4F46E520' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="people" size={24} color="#4F46E5" />
                <Text style={[styles.metricValue, { color: '#4F46E5' }]}>{advancedMetrics.repeatRate.toFixed(1)}%</Text>
              </View>
              <Text style={styles.metricLabel}>{language === 'et' ? 'Korduvkliendid' : 'Repeat Customers'}</Text>
              <Text style={styles.metricSubLabel}>({advancedMetrics.repeatCustomers})</Text>
            </View>

            {/* New Customers This Month */}
            <View style={[styles.metricCard, { backgroundColor: '#F59E0B20' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="person-add" size={24} color="#F59E0B" />
                <Text style={[styles.metricValue, { color: '#F59E0B' }]}>{advancedMetrics.newCustomersThisMonth}</Text>
              </View>
              <Text style={styles.metricLabel}>{language === 'et' ? 'Uued kliendid' : 'New Customers'}</Text>
              <Text style={styles.metricSubLabel}>{language === 'et' ? '(sel kuul)' : '(this month)'}</Text>
            </View>

            {/* New Loans This Month */}
            <View style={[styles.metricCard, { backgroundColor: '#6366F120' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="document-text" size={24} color="#6366F1" />
                <Text style={[styles.metricValue, { color: '#6366F1' }]}>{advancedMetrics.newLoansThisMonth}</Text>
              </View>
              <Text style={styles.metricLabel}>{language === 'et' ? 'Uued laenud' : 'New Loans'}</Text>
              <Text style={styles.metricSubLabel}>{language === 'et' ? '(sel kuul)' : '(this month)'}</Text>
            </View>
          </View>

          {/* Bad Loans Section */}
          <View style={styles.badLoansCard}>
            <View style={styles.badLoansHeader}>
              <Ionicons name="warning" size={24} color="#EF4444" />
              <Text style={styles.badLoansTitle}>{language === 'et' ? 'Halvad laenud' : 'Bad Loans'}</Text>
            </View>
            <View style={styles.badLoansDetails}>
              <View style={styles.badLoansItem}>
                <Text style={styles.badLoansLabel}>{language === 'et' ? 'Arv' : 'Count'}</Text>
                <Text style={styles.badLoansValue}>{advancedMetrics.badLoansCount}</Text>
              </View>
              <View style={styles.badLoansDivider} />
              <View style={styles.badLoansItem}>
                <Text style={styles.badLoansLabel}>{language === 'et' ? 'Summa' : 'Amount'}</Text>
                <Text style={[styles.badLoansValue, { color: '#EF4444' }]}>€{advancedMetrics.badLoansAmount.toFixed(2)}</Text>
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
  // Advanced Metrics styles
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  metricLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  metricSubLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  badLoansCard: {
    backgroundColor: '#EF444420',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  badLoansHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  badLoansTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  badLoansDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badLoansItem: {
    flex: 1,
    alignItems: 'center',
  },
  badLoansDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#EF444440',
  },
  badLoansLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  badLoansValue: {
    fontSize: 20,
    fontWeight: 'bold',
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
