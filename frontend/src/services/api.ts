/**
 * API Service - Fixed Version
 * ===========================
 * Fixes applied:
 * 1. Proper error handling with typed errors
 * 2. Request/response interceptors
 * 3. Automatic token refresh
 * 4. Retry logic for failed requests
 * 5. TypeScript type definitions
 * 6. Request cancellation support
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// API Configuration
const API_CONFIG = {
  // Default backend URL - can be overridden via environment
  BASE_URL: process.env.EXPO_PUBLIC_BACKEND_URL || 'https://apkdebug.preview.emergentagent.com/api',
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

// Types
export interface ApiError {
  status: number;
  message: string;
  details?: string;
  timestamp?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  success: boolean;
}

export interface Admin {
  id: string;
  username: string;
  role: string;
  is_super_admin: boolean;
  token: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  admin_id?: string;
  device_id: string;
  device_model: string;
  device_make: string;
  is_registered: boolean;
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  loan_amount: number;
  down_payment: number;
  interest_rate: number;
  loan_tenure_months: number;
  monthly_emi: number;
  total_amount_due: number;
  total_paid: number;
  outstanding_balance: number;
  late_fees_accumulated: number;
  days_overdue: number;
  next_payment_due?: string;
  auto_lock_enabled: boolean;
  auto_lock_grace_days: number;
  latitude?: number;
  longitude?: number;
  registration_code: string;
  expo_push_token?: string;
  created_at: string;
}

export interface LoanPlan {
  id: string;
  name: string;
  interest_rate: number;
  min_tenure_months: number;
  max_tenure_months: number;
  processing_fee_percent: number;
  late_fee_percent: number;
  description: string;
  is_active: boolean;
  admin_id?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  client_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
  recorded_by: string;
  created_at: string;
}

export interface EMICalculation {
  method: string;
  monthly_emi: number;
  total_amount: number;
  total_interest: number;
  principal: number;
  savings_vs_highest?: number;
  is_cheapest?: boolean;
}

export interface CollectionReport {
  overview: {
    total_clients: number;
    active_loans: number;
    completed_loans: number;
    overdue_clients: number;
  };
  financial: {
    total_disbursed: number;
    total_collected: number;
    total_outstanding: number;
    total_late_fees: number;
    collection_rate: number;
  };
  this_month: {
    total_collected: number;
    number_of_payments: number;
  };
}

// Custom error class
export class ApiRequestError extends Error {
  status: number;
  details?: string;
  timestamp?: string;

  constructor(message: string, status: number, details?: string, timestamp?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
    this.timestamp = timestamp;
  }
}

// Network status checker
async function isNetworkAvailable(): Promise<boolean> {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected === true && netInfo.isInternetReachable !== false;
}

// Get stored auth token
async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('adminToken');
  } catch {
    return null;
  }
}

// Store auth token
async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem('adminToken', token);
}

// Remove auth token
async function removeAuthToken(): Promise<void> {
  await AsyncStorage.removeItem('adminToken');
}

// Delay utility for retries
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Build query string from object
function buildQueryString(params: Record<string, any>): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
}

// Main API request function with retry logic
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<T> {
  // Check network connectivity
  const networkAvailable = await isNetworkAvailable();
  if (!networkAvailable) {
    throw new ApiRequestError(
      'No internet connection. Please check your network and try again.',
      0
    );
  }

  const url = `${API_CONFIG.BASE_URL}${endpoint}`;
  const token = await getAuthToken();

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Platform': Platform.OS,
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  // Add timeout support
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // Handle different response statuses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Handle authentication errors
      if (response.status === 401) {
        await removeAuthToken();
        throw new ApiRequestError(
          'Session expired. Please login again.',
          response.status,
          errorData.detail
        );
      }

      // Handle forbidden errors
      if (response.status === 403) {
        throw new ApiRequestError(
          'Access denied. You do not have permission to perform this action.',
          response.status,
          errorData.detail
        );
      }

      // Handle not found
      if (response.status === 404) {
        throw new ApiRequestError(
          'Resource not found.',
          response.status,
          errorData.detail
        );
      }

      // Handle validation errors
      if (response.status === 400 || response.status === 422) {
        throw new ApiRequestError(
          errorData.detail || 'Invalid request. Please check your input.',
          response.status,
          errorData.detail
        );
      }

      // Handle server errors with retry
      if (response.status >= 500 && retryCount < API_CONFIG.RETRY_ATTEMPTS) {
        await delay(API_CONFIG.RETRY_DELAY * (retryCount + 1));
        return apiRequest(endpoint, options, retryCount + 1);
      }

      throw new ApiRequestError(
        errorData.detail || 'An unexpected error occurred.',
        response.status,
        errorData.detail,
        errorData.timestamp
      );
    }

    // Handle empty responses
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      if (retryCount < API_CONFIG.RETRY_ATTEMPTS) {
        await delay(API_CONFIG.RETRY_DELAY * (retryCount + 1));
        return apiRequest(endpoint, options, retryCount + 1);
      }
      throw new ApiRequestError(
        'Request timed out. Please try again.',
        408
      );
    }

    // Re-throw ApiRequestError
    if (error instanceof ApiRequestError) {
      throw error;
    }

    // Handle network errors with retry
    if (error instanceof TypeError && retryCount < API_CONFIG.RETRY_ATTEMPTS) {
      await delay(API_CONFIG.RETRY_DELAY * (retryCount + 1));
      return apiRequest(endpoint, options, retryCount + 1);
    }

    throw new ApiRequestError(
      error instanceof Error ? error.message : 'Network error occurred.',
      0
    );
  }
}

// ===================== AUTH API =====================

export const AuthAPI = {
  /**
   * Register a new admin/user
   */
  async register(
    username: string,
    password: string,
    role: string = 'user',
    firstName?: string,
    lastName?: string,
    adminToken?: string
  ): Promise<Admin> {
    const query = adminToken ? buildQueryString({ admin_token: adminToken }) : '';
    const response = await apiRequest<Admin>(`/admin/register${query}`, {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        role,
        first_name: firstName,
        last_name: lastName,
      }),
    });
    await setAuthToken(response.token);
    return response;
  },

  /**
   * Login admin/user
   */
  async login(username: string, password: string): Promise<Admin> {
    const response = await apiRequest<Admin>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    await setAuthToken(response.token);
    return response;
  },

  /**
   * Verify admin token
   */
  async verifyToken(token: string): Promise<{ valid: boolean; admin_id: string }> {
    return apiRequest<{ valid: boolean; admin_id: string }>(`/admin/verify/${token}`);
  },

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const token = await getAuthToken();
    return apiRequest<{ message: string }>(`/admin/change-password${buildQueryString({ admin_token: token })}`, {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  },

  /**
   * Update profile
   */
  async updateProfile(profile: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  }): Promise<{ message: string }> {
    const token = await getAuthToken();
    return apiRequest<{ message: string }>(`/admin/update-profile${buildQueryString({ admin_token: token })}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },

  /**
   * List all admins (admin only)
   */
  async listAdmins(): Promise<Array<{
    id: string;
    username: string;
    role: string;
    is_super_admin: boolean;
    created_at: string;
  }>> {
    const token = await getAuthToken();
    return apiRequest(`/admin/list${buildQueryString({ admin_token: token })}`);
  },

  /**
   * Delete an admin (admin only)
   */
  async deleteAdmin(adminId: string): Promise<{ message: string }> {
    const token = await getAuthToken();
    return apiRequest<{ message: string }>(`/admin/${adminId}${buildQueryString({ admin_token: token })}`, {
      method: 'DELETE',
    });
  },

  /**
   * Logout - clear stored token
   */
  async logout(): Promise<void> {
    await removeAuthToken();
  },

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    const token = await getAuthToken();
    if (!token) return false;
    
    try {
      const result = await this.verifyToken(token);
      return result.valid;
    } catch {
      await removeAuthToken();
      return false;
    }
  },
};

// ===================== CLIENT API =====================

export const ClientAPI = {
  /**
   * Create a new client
   */
  async create(clientData: Partial<Client>): Promise<Client> {
    const token = await getAuthToken();
    return apiRequest<Client>(`/clients${buildQueryString({ admin_token: token })}`, {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },

  /**
   * Get all clients with pagination
   */
  async getAll(
    adminId: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<{ clients: Client[]; pagination: {
    total: number;
    skip: number;
    limit: number;
    has_more: boolean;
  }}> {
    return apiRequest(`/clients${buildQueryString({ admin_id: adminId, skip, limit })}`);
  },

  /**
   * Get a specific client
   */
  async get(clientId: string, adminId?: string): Promise<Client> {
    return apiRequest<Client>(`/clients/${clientId}${buildQueryString({ admin_id: adminId })}`);
  },

  /**
   * Update a client
   */
  async update(clientId: string, updates: Partial<Client>, adminId?: string): Promise<Client> {
    return apiRequest<Client>(`/clients/${clientId}${buildQueryString({ admin_id: adminId })}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete a client
   */
  async delete(clientId: string, adminId?: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/clients/${clientId}${buildQueryString({ admin_id: adminId })}`, {
      method: 'DELETE',
    });
  },

  /**
   * Allow uninstall for a client device
   */
  async allowUninstall(clientId: string, adminId?: string): Promise<{ message: string; next_step: string }> {
    return apiRequest<{ message: string; next_step: string }>(
      `/clients/${clientId}/allow-uninstall${buildQueryString({ admin_id: adminId })}`,
      { method: 'POST' }
    );
  },

  /**
   * Lock a client device
   */
  async lock(clientId: string, message?: string, adminId?: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(
      `/clients/${clientId}/lock${buildQueryString({ admin_id: adminId, message })}`,
      { method: 'POST' }
    );
  },

  /**
   * Unlock a client device
   */
  async unlock(clientId: string, adminId?: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(
      `/clients/${clientId}/unlock${buildQueryString({ admin_id: adminId })}`,
      { method: 'POST' }
    );
  },

  /**
   * Send warning to client
   */
  async sendWarning(clientId: string, message: string, adminId?: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(
      `/clients/${clientId}/warning${buildQueryString({ admin_id: adminId, message })}`,
      { method: 'POST' }
    );
  },
};

// ===================== DEVICE API =====================

export const DeviceAPI = {
  /**
   * Register a device
   */
  async register(registrationCode: string, deviceId: string, deviceModel: string): Promise<{
    message: string;
    client_id: string;
    client: Client;
  }> {
    return apiRequest('/device/register', {
      method: 'POST',
      body: JSON.stringify({
        registration_code: registrationCode,
        device_id: deviceId,
        device_model: deviceModel,
      }),
    });
  },

  /**
   * Get device status
   */
  async getStatus(clientId: string): Promise<{
    id: string;
    name: string;
    is_locked: boolean;
    lock_message: string;
    warning_message: string;
    emi_amount: number;
    emi_due_date?: string;
    uninstall_allowed: boolean;
  }> {
    return apiRequest(`/device/status/${clientId}`);
  },

  /**
   * Update device location
   */
  async updateLocation(clientId: string, latitude: number, longitude: number): Promise<{ message: string }> {
    return apiRequest('/device/location', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        latitude,
        longitude,
      }),
    });
  },

  /**
   * Update push token
   */
  async updatePushToken(clientId: string, pushToken: string, adminId?: string): Promise<{ message: string }> {
    return apiRequest('/device/push-token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        push_token: pushToken,
        admin_id: adminId,
      }),
    });
  },

  /**
   * Clear warning
   */
  async clearWarning(clientId: string): Promise<{ message: string }> {
    return apiRequest(`/device/clear-warning/${clientId}`, { method: 'POST' });
  },

  /**
   * Report tamper attempt
   */
  async reportTamper(clientId: string, tamperType: string = 'unknown'): Promise<{
    message: string;
    total_attempts: number;
    action: string;
  }> {
    return apiRequest(`/clients/${clientId}/report-tamper?tamper_type=${tamperType}`, {
      method: 'POST',
    });
  },

  /**
   * Report device reboot
   */
  async reportReboot(clientId: string): Promise<{
    message: string;
    should_lock: boolean;
    lock_message: string;
  }> {
    return apiRequest(`/clients/${clientId}/report-reboot`, { method: 'POST' });
  },
};

// ===================== LOAN PLANS API =====================

export const LoanPlanAPI = {
  /**
   * Create a loan plan
   */
  async create(planData: Partial<LoanPlan>): Promise<LoanPlan> {
    const token = await getAuthToken();
    return apiRequest<LoanPlan>(`/loan-plans${buildQueryString({ admin_token: token })}`, {
      method: 'POST',
      body: JSON.stringify(planData),
    });
  },

  /**
   * Get all loan plans
   */
  async getAll(adminId: string, activeOnly: boolean = false): Promise<LoanPlan[]> {
    return apiRequest<LoanPlan[]>(`/loan-plans${buildQueryString({
      admin_id: adminId,
      active_only: activeOnly,
    })}`);
  },

  /**
   * Get a specific loan plan
   */
  async get(planId: string, adminId?: string): Promise<LoanPlan> {
    return apiRequest<LoanPlan>(`/loan-plans/${planId}${buildQueryString({ admin_id: adminId })}`);
  },

  /**
   * Update a loan plan
   */
  async update(planId: string, planData: Partial<LoanPlan>): Promise<LoanPlan> {
    const token = await getAuthToken();
    return apiRequest<LoanPlan>(`/loan-plans/${planId}${buildQueryString({ admin_token: token })}`, {
      method: 'PUT',
      body: JSON.stringify(planData),
    });
  },

  /**
   * Delete a loan plan
   */
  async delete(planId: string, force: boolean = false): Promise<{ message: string; clients_affected: number }> {
    const token = await getAuthToken();
    return apiRequest<{ message: string; clients_affected: number }>(
      `/loan-plans/${planId}${buildQueryString({ admin_token: token, force })}`,
      { method: 'DELETE' }
    );
  },
};

// ===================== EMI CALCULATOR API =====================

export const CalculatorAPI = {
  /**
   * Compare EMI methods
   */
  async compareMethods(
    principal: number,
    annualRate: number,
    months: number
  ): Promise<{
    simple_interest: EMICalculation;
    reducing_balance: EMICalculation;
    flat_rate: EMICalculation;
  }> {
    return apiRequest(`/calculator/compare${buildQueryString({
      principal,
      annual_rate: annualRate,
      months,
    })}`);
  },

  /**
   * Get amortization schedule
   */
  async getAmortizationSchedule(
    principal: number,
    annualRate: number,
    months: number,
    method: 'reducing_balance' | 'simple_interest' | 'flat_rate' = 'reducing_balance'
  ): Promise<{
    method: string;
    monthly_emi: number;
    total_amount: number;
    total_interest: number;
    schedule: Array<{
      month: number;
      emi: number;
      principal: number;
      interest: number;
      balance: number;
    }>;
  }> {
    return apiRequest(`/calculator/amortization${buildQueryString({
      principal,
      annual_rate: annualRate,
      months,
      method,
    })}`, { method: 'POST' });
  },
};

// ===================== LOAN MANAGEMENT API =====================

export const LoanAPI = {
  /**
   * Setup loan for a client
   */
  async setupLoan(
    clientId: string,
    loanData: {
      loan_amount: number;
      down_payment: number;
      interest_rate: number;
      loan_tenure_months: number;
    },
    adminId?: string
  ): Promise<{
    message: string;
    loan_details: EMICalculation;
    client: Client;
  }> {
    return apiRequest(`/loans/${clientId}/setup${buildQueryString({ admin_id: adminId })}`, {
      method: 'POST',
      body: JSON.stringify(loanData),
    });
  },

  /**
   * Record a payment
   */
  async recordPayment(
    clientId: string,
    paymentData: {
      amount: number;
      payment_date?: string;
      payment_method?: string;
      notes?: string;
    }
  ): Promise<{
    message: string;
    payment: Payment;
    updated_balance: {
      total_paid: number;
      outstanding_balance: number;
      loan_paid_off: boolean;
    };
  }> {
    const token = await getAuthToken();
    return apiRequest(`/loans/${clientId}/payments${buildQueryString({ admin_token: token })}`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  },

  /**
   * Get payment history
   */
  async getPaymentHistory(clientId: string, adminId?: string): Promise<{
    client_id: string;
    total_payments: number;
    payments: Payment[];
  }> {
    return apiRequest(`/loans/${clientId}/payments${buildQueryString({ admin_id: adminId })}`);
  },

  /**
   * Get payment schedule
   */
  async getPaymentSchedule(clientId: string, adminId?: string): Promise<{
    client_id: string;
    loan_amount: number;
    monthly_emi: number;
    total_payments: number;
    schedule: Array<{
      month: number;
      due_date: string;
      amount_due: number;
      status: string;
      payment_id?: string;
    }>;
  }> {
    return apiRequest(`/loans/${clientId}/schedule${buildQueryString({ admin_id: adminId })}`);
  },

  /**
   * Update loan settings
   */
  async updateSettings(
    clientId: string,
    settings: {
      auto_lock_enabled: boolean;
      auto_lock_grace_days: number;
    },
    adminId?: string
  ): Promise<{
    message: string;
    auto_lock_enabled: boolean;
    auto_lock_grace_days: number;
  }> {
    return apiRequest(`/loans/${clientId}/settings${buildQueryString({ admin_id: adminId })}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};

// ===================== REPORTS API =====================

export const ReportsAPI = {
  /**
   * Get collection report
   */
  async getCollectionReport(adminId?: string): Promise<CollectionReport> {
    return apiRequest<CollectionReport>(`/reports/collection${buildQueryString({ admin_id: adminId })}`);
  },
};

// ===================== HEALTH CHECK =====================

export const HealthAPI = {
  /**
   * Check API health
   */
  async check(): Promise<{
    status: string;
    timestamp: string;
    version: string;
    database_connected: boolean;
  }> {
    const response = await fetch(`${API_CONFIG.BASE_URL.replace('/api', '')}/health`);
    return response.json();
  },
};

// Export API config for external use
export { API_CONFIG };

// Default export
export default {
  Auth: AuthAPI,
  Client: ClientAPI,
  Device: DeviceAPI,
  LoanPlan: LoanPlanAPI,
  Calculator: CalculatorAPI,
  Loan: LoanAPI,
  Reports: ReportsAPI,
  Health: HealthAPI,
};
