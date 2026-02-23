export interface LoanDetails {
  loan_amount: number;
  total_amount_due: number;
  total_paid: number;
  outstanding_balance: number;
  monthly_emi: number;
  next_payment_due: string | null;
  days_overdue: number;
}

export interface LoanHistoryItem {
  id: string;
  loan_amount: number;
  interest_rate: number;
  total_amount_due: number;
  total_paid: number;
  total_interest: number;
  loan_start_date: string | null;
  loan_due_date: string | null;
  paid_date: string;
  archived_at: string;
  payment_count: number;
  final_credit_score: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  device_id: string;
  device_model: string;
  device_make: string;
  used_price_eur: number | null;
  price_fetched_at: string | null;
  registration_code: string;
  emi_amount: number;
  emi_due_date: string | null;
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
  is_registered: boolean;
  registered_at: string | null;
  created_at: string;
  tamper_attempts: number;
  last_tamper_attempt: string | null;
  last_reboot: string | null;
  admin_mode_active?: boolean;
  uninstall_allowed?: boolean;
  loan_amount?: number;
  total_amount_due?: number;
  total_paid?: number;
  outstanding_balance?: number;
  monthly_emi?: number;
  next_payment_due?: string | null;
  days_overdue?: number;
  loan_start_date?: string | null;
  loan_due_date?: string | null;
  interest_rate?: number;
  is_late?: boolean;
  late_fees_accumulated?: number;
  auto_lock_enabled?: boolean;
  auto_lock_grace_days?: number;
  credit_score?: number;
}

export interface LoanPreview {
  monthly_emi: number;
  total_amount_due: number;
  tenure_months: number;
  total_interest: number;
}
