import React, { useState, useEffect, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, PieChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useTheme } from '../../src/context/ThemeContext';
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
  const { language, t } = useLanguage();
  const { colors } = useTheme();
  const { formatAmount, currencySymbol } = useCurrency();
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
  const [calculatingFees, setCalculatingFees] = useState(false);

  const months = language === 'et' 
    ? ['Jaanuar', 'Veebruar', 'Märts', 'Aprill', 'Mai', 'Juuni', 'Juuli', 'August', 'September', 'Oktoober', 'November', 'Detsember']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        console.error('Admin token not found');
        return;
      }
      
      const [collection, clients, financial] = await Promise.all([
        fetch(`${API_URL}/api/reports/collection?admin_token=${adminToken}`).then(r => r.json()),
        fetch(`${API_URL}/api/reports/clients?admin_token=${adminToken}`).then(r => r.json()),
        fetch(`${API_URL}/api/reports/financial?admin_token=${adminToken}`).then(r => r.json()),
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReports();
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [])
  );

  const handleCalculateLateFees = async () => {
    setCalculatingFees(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/api/late-fees/calculate-all?admin_token=${token}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to calculate late fees');
      }
      const data = await response.json();
      Alert.alert(
        t('success'),
        language === 'et' 
          ? `Viivised arvutatud! ${data.updated_count || 0} klienti uuendatud.`
          : `Late fees calculated! ${data.updated_count || 0} clients updated.`
      );
      fetchReports(); // Refresh data
    } catch (error: any) {
      Alert.alert(
        t('error'),
        error.message || (t('failedToCalculateLateFees'))
      );
    } finally {
      setCalculatingFees(false);
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
        const monthIndex = monthsEn.findIndex(name => 
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

    const filteredInterest = (financialReport?.monthly_interest || []).filter((m: any) => {
      const [monthName, year] = (m.month || '').split(' ');
      if (parseInt(year) !== selectedYear) return false;
      if (selectedMonth !== null) {
        const monthIndex = monthsEn.findIndex(name =>
          monthName.toLowerCase().startsWith(name.substring(0, 3).toLowerCase())
        );
        if (monthIndex !== selectedMonth) return false;
      }
      return true;
    });

    const interestEarned = filteredInterest.reduce(
      (sum: number, m: any) => sum + (m.interest_earned || 0),
      0
    );
    const principalDisbursed = financialReport?.totals?.principal_disbursed || 0;
    const principalCollected = Math.max(totalRevenue - interestEarned, 0);

    const roi = principalDisbursed > 0 ? ((interestEarned / principalDisbursed) * 100) : 0;

    return {
      totalRevenue,
      totalPayments,
      interestEarned,
      principalCollected,
      profit: interestEarned,
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
      const adminFirstName = await AsyncStorage.getItem('admin_first_name') || '';
      const adminLastName = await AsyncStorage.getItem('admin_last_name') || '';
      const adminUsername = await AsyncStorage.getItem('admin_username') || 'Admin User';
      
      // Use name from financial report API if available, otherwise from AsyncStorage
      const reportAdminName = financialReport?.admin?.first_name && financialReport?.admin?.last_name
        ? `${financialReport.admin.first_name} ${financialReport.admin.last_name}`
        : adminFirstName && adminLastName
        ? `${adminFirstName} ${adminLastName}`
        : adminUsername;
      
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
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${currencySymbol}${m.revenue.toFixed(2)}</td>
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
            <title>${t('profitReport')}</title>
            <style>
              body {
                font-family: 'Helvetica', 'Arial', sans-serif;
                padding: 40px;
                color: #1e293b;
              }
              .header {
                text-align: center;
                margin-bottom: 40px;
                border-bottom: 2px solid #2563EB;
                padding-bottom: 20px;
              }
              .header h1 {
                color: #2563EB;
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
                border-left: 4px solid #2563EB;
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
                border-left: 4px solid #2563EB;
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
                background: #2563EB;
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
              <h1>${t('profitReport2')}</h1>
              <p>${periodLabel}</p>
            </div>

            <div class="user-info">
              <p><span class="label">${t('generatedBy')}</span> ${reportAdminName}</p>
              <p><span class="label">${t('date')}</span> ${new Date().toLocaleString(t('enus'))}</p>
            </div>

            <div class="summary-grid">
              <div class="summary-card">
                <h3>${t('totalRevenue')}</h3>
                <div class="value">${currencySymbol}${summary.totalRevenue.toFixed(2)}</div>
              </div>
              <div class="summary-card profit">
                <h3>${t('profitInterest')}</h3>
                <div class="value">${currencySymbol}${summary.profit.toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>${t('interestEarned')}</h3>
                <div class="value">${currencySymbol}${summary.interestEarned.toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>${t('numberOfPayments')}</h3>
                <div class="value">${summary.totalPayments}</div>
              </div>
            </div>

            ${filteredData.length > 0 ? `
              <div class="section">
                <h2>${t('monthlyBreakdown')}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>${t('month')}</th>
                      <th style="text-align: right;">${t('revenue')}</th>
                      <th style="text-align: center;">${t('payments')}</th>
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
                <h2>${t('financialOverview')}</h2>
                <table>
                  <tbody>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t('principalDisbursed')}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${currencySymbol}${financialReport.totals.principal_disbursed.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t('interestEarned')}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #10B981;">${currencySymbol}${financialReport.totals.interest_earned.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t('processingFees')}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${currencySymbol}${financialReport.totals.processing_fees.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${t('lateFees')}</td>
                      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${currencySymbol}${financialReport.totals.late_fees.toFixed(2)}</td>
                    </tr>
                    <tr class="totals-row">
                      <td style="padding: 12px 8px;">${t('totalRevenue')}</td>
                      <td style="padding: 12px 8px; text-align: right; color: #2563EB; font-size: 18px;">${currencySymbol}${financialReport.totals.total_revenue.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ` : ''}

            <div class="footer">
              <p>${t('loanManagementSystem')} &copy; ${new Date().getFullYear()}</p>
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
          dialogTitle: `${t('profitReport')} - ${periodLabel}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          t('ready'),
          language === 'et' ? `PDF salvestatud: ${uri}` : `PDF saved: ${uri}`
        );
      }

    } catch (error) {
      console.error('Error generating report:', error);
      Alert.alert(
        t('error'),
        t('failedToGenerateReport')
      );
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  const profitSummary = getProfitSummary();
  const advancedMetrics = getAdvancedMetrics();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('reportsAnalytics')}</Text>
        <TouchableOpacity 
          onPress={handleCalculateLateFees} 
          style={styles.refreshButton}
          disabled={calculatingFees}
          data-testid="calculate-late-fees-btn"
        >
          {calculatingFees ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="calculator" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Period Filter Section */}
        <View style={styles.filterSection}>
          <Text style={[styles.filterTitle, { color: colors.text }]}>{t('period')}</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity 
              style={[styles.filterButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowYearPicker(true)}
            >
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={[styles.filterButtonText, { color: colors.text }]}>{selectedYear}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowMonthPicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.filterButtonText, { color: colors.text }]}>
                {selectedMonth !== null ? months[selectedMonth] : (t('allMonths'))}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
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
                  {t('exportReport')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Profit Summary for Selected Period */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('profitSummary')} - {selectedMonth !== null ? months[selectedMonth] : ''} {selectedYear}
          </Text>
          <View style={[styles.profitCard, { backgroundColor: colors.surface }]}>
            <View style={styles.profitMainRow}>
              <View style={styles.profitMainItem}>
                <Ionicons name="wallet" size={32} color={colors.success} />
                <Text style={[styles.profitMainValue, { color: colors.text }]}>{formatAmount(profitSummary.totalRevenue)}</Text>
                <Text style={[styles.profitMainLabel, { color: colors.textMuted }]}>{t('totalRevenue')}</Text>
              </View>
              <View style={styles.profitMainItem}>
                <Ionicons name="trending-up" size={32} color={colors.primary} />
                <Text style={[styles.profitMainValue, { color: colors.primary }]}>{formatAmount(profitSummary.profit)}</Text>
                <Text style={[styles.profitMainLabel, { color: colors.textMuted }]}>{t('profitInterest')}</Text>
              </View>
            </View>
            <View style={styles.profitDetailsRow}>
              <View style={styles.profitDetailItem}>
                <Text style={styles.profitDetailLabel}>{t('payments')}</Text>
                <Text style={styles.profitDetailValue}>{profitSummary.totalPayments}</Text>
              </View>
              <View style={styles.profitDetailItem}>
                <Text style={styles.profitDetailLabel}>{t('interestEarned')}</Text>
                <Text style={styles.profitDetailValue}>{formatAmount(profitSummary.interestEarned)}</Text>
              </View>
              <View style={styles.profitDetailItem}>
                <Text style={styles.profitDetailLabel}>{t('roi')}</Text>
                <Text style={[styles.profitDetailValue, { color: '#10B981' }]}>{profitSummary.roi.toFixed(1)}%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Advanced Metrics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('advancedMetrics')}
          </Text>
          <View style={styles.metricsGrid}>
            {/* Strike Rate */}
            <View style={[styles.metricCard, { backgroundColor: '#10B98120' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="checkmark-done-circle" size={24} color="#10B981" />
                <Text style={[styles.metricValue, { color: '#10B981' }]}>{advancedMetrics.strikeRate.toFixed(1)}%</Text>
              </View>
              <Text style={styles.metricLabel}>{t('strikeRate')}</Text>
            </View>

            {/* Repeat Customers */}
            <View style={[styles.metricCard, { backgroundColor: '#2563EB20' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="people" size={24} color="#2563EB" />
                <Text style={[styles.metricValue, { color: '#2563EB' }]}>{advancedMetrics.repeatRate.toFixed(1)}%</Text>
              </View>
              <Text style={styles.metricLabel}>{t('repeatCustomers')}</Text>
              <Text style={styles.metricSubLabel}>({advancedMetrics.repeatCustomers})</Text>
            </View>

            {/* New Customers This Month */}
            <View style={[styles.metricCard, { backgroundColor: '#F59E0B20' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="person-add" size={24} color="#F59E0B" />
                <Text style={[styles.metricValue, { color: '#F59E0B' }]}>{advancedMetrics.newCustomersThisMonth}</Text>
              </View>
              <Text style={styles.metricLabel}>{t('newCustomers')}</Text>
              <Text style={styles.metricSubLabel}>{t('thisMonth')}</Text>
            </View>

            {/* New Loans This Month */}
            <View style={[styles.metricCard, { backgroundColor: '#3B82F620' }]}>
              <View style={styles.metricHeader}>
                <Ionicons name="document-text" size={24} color="#3B82F6" />
                <Text style={[styles.metricValue, { color: '#3B82F6' }]}>{advancedMetrics.newLoansThisMonth}</Text>
              </View>
              <Text style={styles.metricLabel}>{t('newLoans')}</Text>
              <Text style={styles.metricSubLabel}>{t('thisMonth')}</Text>
            </View>
          </View>

          {/* Bad Loans Section */}
          <View style={styles.badLoansCard}>
            <View style={styles.badLoansHeader}>
              <Ionicons name="warning" size={24} color="#EF4444" />
              <Text style={styles.badLoansTitle}>{t('badLoans')}</Text>
            </View>
            <View style={styles.badLoansDetails}>
              <View style={styles.badLoansItem}>
                <Text style={styles.badLoansLabel}>{t('count')}</Text>
                <Text style={styles.badLoansValue}>{advancedMetrics.badLoansCount}</Text>
              </View>
              <View style={styles.badLoansDivider} />
              <View style={styles.badLoansItem}>
                <Text style={styles.badLoansLabel}>{t('amount')}</Text>
                <Text style={[styles.badLoansValue, { color: '#EF4444' }]}>{formatAmount(advancedMetrics.badLoansAmount)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Collection Report */}
        {collectionReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('collectionOverview')}</Text>
            
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#2563EB20' }]}>
                <Ionicons name="people" size={24} color="#2563EB" />
                <Text style={styles.statValue}>{collectionReport.overview?.total_clients || 0}</Text>
                <Text style={styles.statLabel}>{t('totalClients')}</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="trending-up" size={24} color="#10B981" />
                <Text style={styles.statValue}>{collectionReport.overview?.active_loans || 0}</Text>
                <Text style={styles.statLabel}>{t('activeLoans')}</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#EF444420' }]}>
                <Ionicons name="warning" size={24} color="#EF4444" />
                <Text style={styles.statValue}>{collectionReport.overview?.overdue_clients || 0}</Text>
                <Text style={styles.statLabel}>{t('overdue')}</Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#F59E0B" />
                <Text style={styles.statValue}>{collectionReport.overview?.completed_loans || 0}</Text>
                <Text style={styles.statLabel}>{t('completed')}</Text>
              </View>
            </View>

            <View style={styles.financialCard}>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{t('disbursed')}</Text>
                <Text style={styles.financialValue}>{formatAmount(collectionReport.financial?.total_disbursed || 0)}</Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{t('collected')}</Text>
                <Text style={[styles.financialValue, { color: '#10B981' }]}>
                  {formatAmount(collectionReport.financial?.total_collected || 0)}
                </Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{t('outstanding')}</Text>
                <Text style={[styles.financialValue, { color: '#F59E0B' }]}>
                  {formatAmount(collectionReport.financial?.total_outstanding || 0)}
                </Text>
              </View>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>{t('lateFees')}</Text>
                <Text style={[styles.financialValue, { color: '#EF4444' }]}>
                  {formatAmount(collectionReport.financial?.total_late_fees || 0)}
                </Text>
              </View>
              <View style={[styles.financialRow, styles.separator]}>
                <Text style={[styles.financialLabel, { fontWeight: 'bold' }]}>{t('collectionRate')}</Text>
                <Text style={[styles.financialValue, { color: '#2563EB', fontWeight: 'bold' }]}>
                  {collectionReport.financial?.collection_rate || 0}%
                </Text>
              </View>
            </View>

            <View style={styles.monthCard}>
              <Text style={styles.monthTitle}>{t('thisMonth2')}</Text>
              <View style={styles.monthDetails}>
                <View>
                  <Text style={styles.monthLabel}>{t('collected')}</Text>
                  <Text style={styles.monthValue}>{formatAmount(collectionReport.this_month?.total_collected || 0)}</Text>
                </View>
                <View>
                  <Text style={styles.monthLabel}>{t('payments')}</Text>
                  <Text style={styles.monthValue}>{collectionReport.this_month?.number_of_payments || 0}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Client Report */}
        {clientReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('clientStatusDistribution')}</Text>
            
            {/* Pie Chart for Client Status - only show if there's data */}
            {(() => {
              const onTime = clientReport.summary?.on_time_clients || 0;
              const atRisk = clientReport.summary?.at_risk_clients || 0;
              const defaulted = clientReport.summary?.defaulted_clients || 0;
              const completed = clientReport.summary?.completed_clients || 0;
              const total = onTime + atRisk + defaulted + completed;
              
              // Only render PieChart if there's actual data
              if (total === 0) {
                return (
                  <View style={styles.noPriceCard}>
                    <Ionicons name="pie-chart-outline" size={24} color="#64748B" />
                    <Text style={styles.noPriceText}>
                      {t('noDataAvailableYet')}
                    </Text>
                  </View>
                );
              }
              
              // Filter out zero-value entries to prevent chart issues
              const chartData = [
                { name: t('onTime'), population: onTime, color: '#10B981', legendFontColor: '#94A3B8', legendFontSize: 12 },
                { name: t('atRisk'), population: atRisk, color: '#F59E0B', legendFontColor: '#94A3B8', legendFontSize: 12 },
                { name: t('defaulted'), population: defaulted, color: '#EF4444', legendFontColor: '#94A3B8', legendFontSize: 12 },
                { name: t('completed'), population: completed, color: '#2563EB', legendFontColor: '#94A3B8', legendFontSize: 12 },
              ].filter(item => item.population > 0);
              
              return (
                <View style={styles.chartContainer}>
                  <PieChart
                    data={chartData}
                    width={screenWidth - 40}
                    height={220}
                    chartConfig={{
                      backgroundColor: '#152035',
                      backgroundGradientFrom: '#152035',
                      backgroundGradientTo: '#152035',
                      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    }}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="15"
                    absolute
                  />
                </View>
              );
            })()}

            {(clientReport.details?.at_risk?.length || 0) > 0 && (
              <View style={styles.alertBox}>
                <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                <Text style={styles.alertText}>
                  {clientReport.details.at_risk.length} {t('clientsNeedAttention')}
                </Text>
              </View>
            )}

            {(clientReport.details?.defaulted?.length || 0) > 0 && (
              <View style={[styles.alertBox, { backgroundColor: '#EF444420', borderColor: '#EF4444' }]}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <Text style={[styles.alertText, { color: '#EF4444' }]}>
                  {clientReport.details.defaulted.length} {t('clientsDefaulted7Days')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Financial Report */}
        {financialReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('financialBreakdown')}</Text>
            
            <View style={styles.revenueCard}>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{t('principal')}</Text>
                <Text style={styles.revenueValue}>{formatAmount(financialReport.totals?.principal_disbursed || 0)}</Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{t('interest')}</Text>
                <Text style={[styles.revenueValue, { color: '#10B981' }]}>
                  {formatAmount(financialReport.totals?.interest_earned || 0)}
                </Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{t('processingFees')}</Text>
                <Text style={styles.revenueValue}>{formatAmount(financialReport.totals?.processing_fees || 0)}</Text>
              </View>
              <View style={styles.revenueItem}>
                <Text style={styles.revenueLabel}>{t('lateFees')}</Text>
                <Text style={styles.revenueValue}>{formatAmount(financialReport.totals?.late_fees || 0)}</Text>
              </View>
              <View style={[styles.revenueItem, styles.separator]}>
                <Text style={[styles.revenueLabel, { fontWeight: 'bold' }]}>{t('totalRevenue')}</Text>
                <Text style={[styles.revenueValue, { color: '#2563EB', fontWeight: 'bold', fontSize: 20 }]}>
                  {formatAmount(financialReport.totals?.total_revenue || 0)}
                </Text>
              </View>
            </View>

            <Text style={styles.trendTitle}>{t('step6monthRevenueTrend')}</Text>
            {/* Line chart - only render if there's trend data */}
            {(() => {
              const trendData = financialReport.monthly_trend || [];
              const hasData = trendData.length > 0 && trendData.some((m: any) => (m.revenue || 0) > 0);
              
              if (!hasData) {
                return (
                  <View style={styles.noPriceCard}>
                    <Ionicons name="analytics-outline" size={24} color="#64748B" />
                    <Text style={styles.noPriceText}>
                      {t('noTrendDataAvailableYet')}
                    </Text>
                  </View>
                );
              }
              
              // Ensure we have at least one data point to avoid chart crash
              const chartLabels = trendData.map((m: any) => {
                const [month] = (m.month || '').split(' ');
                return month.substring(0, 3);
              });
              const chartValues = trendData.map((m: any) => m.revenue || 0);
              
              // If all values are 0, add a small dummy to prevent crash
              const hasNonZero = chartValues.some((v: number) => v > 0);
              const safeChartValues = hasNonZero ? chartValues : [0.01];
              const safeChartLabels = hasNonZero ? chartLabels : [''];
              
              return (
                <View style={styles.chartContainer}>
                  <LineChart
                    data={{
                      labels: safeChartLabels,
                      datasets: [{ data: safeChartValues }],
                    }}
                    width={screenWidth - 40}
                    height={220}
                    chartConfig={{
                      backgroundColor: '#152035',
                      backgroundGradientFrom: '#152035',
                      backgroundGradientTo: '#1E3050',
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                      labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
                      style: { borderRadius: 16 },
                      propsForDots: { r: '6', strokeWidth: '2', stroke: '#2563EB' },
                    }}
                    bezier
                    style={{ marginVertical: 8, borderRadius: 16 }}
                  />
                </View>
              );
            })()}

            {/* Trend summary */}
            <View style={styles.trendSummary}>
              {(financialReport.monthly_trend || []).map((month: any, index: number) => (
                <View key={index} style={styles.trendSummaryItem}>
                  <Text style={styles.trendSummaryMonth}>{month.month}</Text>
                  <Text style={styles.trendSummaryValue}>{formatAmount(month.revenue || 0, 0)}</Text>
                  <Text style={styles.trendSummaryCount}>{month.payments_count || 0} {t('payments2')}</Text>
                </View>
              ))}
            </View>

            {/* Monthly Interest Earned */}
            <Text style={[styles.trendTitle, { marginTop: 20 }]}>
              {t('monthlyInterestEarnedLast6Months')}
            </Text>
            {(() => {
              const interestData = financialReport.monthly_interest || [];
              const maxInterest = Math.max(...interestData.map((m: any) => m.interest_earned || 0), 1);
              const hasInterestData = interestData.some((m: any) => (m.interest_earned || 0) > 0);

              return (
                <View style={{ marginBottom: 8 }}>
                  {interestData.map((month: any, index: number) => {
                    const earned = month.interest_earned || 0;
                    const barWidth = hasInterestData ? Math.max((earned / maxInterest) * 100, 2) : 0;
                    const monthLabel = (month.month || '').split(' ')[0]?.substring(0, 3) || '';
                    return (
                      <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ color: '#94A3B8', fontSize: 11, width: 40 }}>{monthLabel}</Text>
                        <View style={{ flex: 1, height: 20, backgroundColor: '#0B1527', borderRadius: 5, overflow: 'hidden', marginHorizontal: 10 }}>
                          {earned > 0 && (
                            <View style={{ height: 20, width: `${barWidth}%`, backgroundColor: '#10B981', borderRadius: 5 }} />
                          )}
                        </View>
                        <Text style={{ color: earned > 0 ? '#10B981' : '#475569', fontSize: 12, fontWeight: '600', width: 70, textAlign: 'right' }}>
                          {formatAmount(earned, 0)}
                        </Text>
                      </View>
                    );
                  })}
                  {!hasInterestData && (
                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                      <Text style={{ color: '#475569', fontSize: 12 }}>{t('noInterestDataYet') || 'Interest data will appear as payments are made'}</Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        )}
      </ScrollView>

      {/* Year Picker Modal */}
      <Modal visible={showYearPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>{t('selectYear')}</Text>
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
              <Text style={styles.pickerCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Month Picker Modal */}
      <Modal visible={showMonthPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>{t('selectMonth')}</Text>
            <ScrollView style={styles.pickerList}>
              <TouchableOpacity
                style={[styles.pickerItem, selectedMonth === null && styles.pickerItemActive]}
                onPress={() => {
                  setSelectedMonth(null);
                  setShowMonthPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, selectedMonth === null && styles.pickerItemTextActive]}>
                  {t('allMonths')}
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
              <Text style={styles.pickerCloseText}>{t('close')}</Text>
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
    backgroundColor: '#0B1527',
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
    borderBottomColor: '#152035',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#152035',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563EB',
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
    backgroundColor: '#152035',
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
    borderTopColor: '#1E3050',
    marginTop: 8,
    paddingTop: 12,
  },
  monthCard: {
    backgroundColor: '#2563EB20',
    borderRadius: 12,
    padding: 16,
  },
  monthTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
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
    backgroundColor: '#152035',
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
    backgroundColor: '#152035',
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
    backgroundColor: '#152035',
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
    color: '#2563EB',
    marginBottom: 2,
  },
  trendSummaryCount: {
    fontSize: 10,
    color: '#94A3B8',
  },
  // Filter section styles
  filterSection: {
    backgroundColor: '#152035',
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
    backgroundColor: '#0B1527',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
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
    backgroundColor: '#2563EB',
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
    backgroundColor: '#152035',
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
    borderTopColor: '#1E3050',
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
    backgroundColor: '#152035',
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
    backgroundColor: '#2563EB20',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  pickerItemTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  pickerCloseButton: {
    backgroundColor: '#1E3050',
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
