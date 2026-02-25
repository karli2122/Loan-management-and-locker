import React from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DatePicker } from '../../components/DatePicker';
import { styles } from './styles';
import { Client, LoanPreview } from './types';

// ─── Payment Modal ───────────────────────────────────────────────
interface PaymentModalProps {
  visible: boolean;
  client: Client;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  paymentAmount: string;
  paymentMethod: string;
  paymentNotes: string;
  onChangeAmount: (v: string) => void;
  onChangeMethod: (v: string) => void;
  onChangeNotes: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const PaymentModal = ({
  visible, client, language, t, actionLoading,
  paymentAmount, paymentMethod, paymentNotes,
  onChangeAmount, onChangeMethod, onChangeNotes, onConfirm, onClose,
}: PaymentModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{t('recordPayment')}</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('amountU20ac')}</Text>
          <TextInput
            style={styles.paymentInput}
            value={paymentAmount}
            onChangeText={onChangeAmount}
            placeholder={(client.monthly_emi || 0).toFixed(2)}
            keyboardType="decimal-pad"
            placeholderTextColor="#64748B"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('paymentMethod')}</Text>
          <View style={styles.methodButtons}>
            {['cash', 'bank_transfer', 'card'].map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.methodButton, paymentMethod === method && styles.methodButtonActive]}
                onPress={() => onChangeMethod(method)}
              >
                <Text style={[styles.methodButtonText, paymentMethod === method && styles.methodButtonTextActive]}>
                  {method === 'cash' ? (t('cash')) :
                   method === 'bank_transfer' ? (t('transfer')) :
                   (t('card'))}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('notesOptional')}</Text>
          <TextInput
            style={[styles.paymentInput, styles.textArea]}
            value={paymentNotes}
            onChangeText={onChangeNotes}
            placeholder={t('paymentNotes')}
            placeholderTextColor="#64748B"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.paymentConfirmButton]}
            onPress={onConfirm}
            disabled={actionLoading}
            data-testid="confirm-payment-btn"
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalConfirmText}>{t('record')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Warning Modal ───────────────────────────────────────────────
interface WarningModalProps {
  visible: boolean;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  warningMessage: string;
  onChangeMessage: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const WarningModal = ({
  visible, t, actionLoading, warningMessage,
  onChangeMessage, onConfirm, onClose,
}: WarningModalProps) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{t('sendWarning')}</Text>
        <TextInput
          style={styles.modalInput}
          placeholder={t('enterWarningMessage')}
          placeholderTextColor="#64748B"
          value={warningMessage}
          onChangeText={onChangeMessage}
          multiline
          numberOfLines={4}
        />
        <View style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalConfirmButton]}
            onPress={onConfirm}
            disabled={actionLoading}
            data-testid="confirm-warning-btn"
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalConfirmText}>{t('send')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Lock Modal ──────────────────────────────────────────────────
interface LockModalProps {
  visible: boolean;
  t: (key: string) => string;
  actionLoading: boolean;
  lockMessage: string;
  onChangeMessage: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const LockModal = ({
  visible, t, actionLoading, lockMessage,
  onChangeMessage, onConfirm, onClose,
}: LockModalProps) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{t('lockDevice')}</Text>
        <Text style={styles.modalSubtitle}>{t('customizeLockMessage')}</Text>
        <TextInput
          style={styles.modalInput}
          placeholder={t('enterLockMessage')}
          placeholderTextColor="#64748B"
          value={lockMessage}
          onChangeText={onChangeMessage}
          multiline
          numberOfLines={4}
        />
        <View style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.lockConfirmButton]}
            onPress={onConfirm}
            disabled={actionLoading}
            data-testid="confirm-lock-btn"
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalConfirmText}>{t('lock')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Edit Device Modal ───────────────────────────────────────────
interface EditDeviceModalProps {
  visible: boolean;
  t: (key: string) => string;
  actionLoading: boolean;
  editDeviceMake: string;
  editDeviceModel: string;
  editDevicePrice: string;
  onChangeMake: (v: string) => void;
  onChangeModel: (v: string) => void;
  onChangePrice: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditDeviceModal = ({
  visible, t, actionLoading,
  editDeviceMake, editDeviceModel, editDevicePrice,
  onChangeMake, onChangeModel, onChangePrice, onConfirm, onClose,
}: EditDeviceModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{t('editDeviceInfo')}</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('deviceMake')}</Text>
          <TextInput
            style={styles.modalInput}
            value={editDeviceMake}
            onChangeText={onChangeMake}
            placeholder={t('deviceMake')}
            placeholderTextColor="#64748B"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('deviceModel')}</Text>
          <TextInput
            style={styles.modalInput}
            value={editDeviceModel}
            onChangeText={onChangeModel}
            placeholder={t('deviceModel')}
            placeholderTextColor="#64748B"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('usedPrice')} (EUR)</Text>
          <TextInput
            style={styles.modalInput}
            value={editDevicePrice}
            onChangeText={onChangePrice}
            placeholder="0.00"
            placeholderTextColor="#64748B"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalConfirmButton]}
            onPress={onConfirm}
            disabled={actionLoading}
            data-testid="save-device-info-btn"
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Edit Client Modal ───────────────────────────────────────────
interface EditClientModalProps {
  visible: boolean;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  editClientName: string;
  editClientPhone: string;
  editClientEmail: string;
  editClientAddress: string;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangeAddress: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditClientModal = ({
  visible, language, t, actionLoading,
  editClientName, editClientPhone, editClientEmail, editClientAddress,
  onChangeName, onChangePhone, onChangeEmail, onChangeAddress,
  onConfirm, onClose,
}: EditClientModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>
          {t('editClientInfo')}
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('name')}</Text>
          <TextInput
            style={styles.modalInput}
            value={editClientName}
            onChangeText={onChangeName}
            placeholder={t('clientName')}
            placeholderTextColor="#64748B"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('phone')}</Text>
          <TextInput
            style={styles.modalInput}
            value={editClientPhone}
            onChangeText={onChangePhone}
            placeholder={t('phoneNumber2')}
            placeholderTextColor="#64748B"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('email')}</Text>
          <TextInput
            style={styles.modalInput}
            value={editClientEmail}
            onChangeText={onChangeEmail}
            placeholder={t('emailAddress2')}
            placeholderTextColor="#64748B"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('address')}</Text>
          <TextInput
            style={styles.modalInput}
            value={editClientAddress}
            onChangeText={onChangeAddress}
            placeholder={t('address')}
            placeholderTextColor="#64748B"
            data-testid="client-address-input"
          />
        </View>

        <View style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalConfirmButton]}
            onPress={onConfirm}
            disabled={actionLoading}
            data-testid="save-client-info-btn"
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Edit Loan Modal ─────────────────────────────────────────────
interface EditLoanModalProps {
  visible: boolean;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  previewLoading: boolean;
  editLoanAmount: string;
  editInterestRate: string;
  editLoanStartDate: string;
  editLoanDueDate: string;
  loanPreview: LoanPreview | null;
  onChangeLoanAmount: (v: string) => void;
  onChangeInterestRate: (v: string) => void;
  onChangeLoanStartDate: (v: string) => void;
  onChangeLoanDueDate: (v: string) => void;
  onFetchPreview: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditLoanModal = ({
  visible, language, t, actionLoading, previewLoading,
  editLoanAmount, editInterestRate, editLoanStartDate, editLoanDueDate, loanPreview,
  onChangeLoanAmount, onChangeInterestRate, onChangeLoanStartDate, onChangeLoanDueDate,
  onFetchPreview, onConfirm, onClose,
}: EditLoanModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <ScrollView contentContainerStyle={styles.modalScrollContent}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {t('editLoanTerms')}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('loanAmountU20ac')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editLoanAmount}
              onChangeText={onChangeLoanAmount}
              placeholder="0.00"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              data-testid="edit-loan-amount-input"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('monthlyInterestRate')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editInterestRate}
              onChangeText={onChangeInterestRate}
              placeholder="2.0"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              data-testid="edit-loan-rate-input"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('loanStartDate')}</Text>
            <DatePicker
              value={editLoanStartDate}
              onChange={onChangeLoanStartDate}
              placeholder={t('selectDate')}
              testID="edit-loan-start-date-input"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('dueDate')}</Text>
            <DatePicker
              value={editLoanDueDate}
              onChange={onChangeLoanDueDate}
              placeholder={t('selectDate')}
              minDate={new Date()}
              testID="edit-loan-due-date-input"
            />
          </View>

          <TouchableOpacity
            style={styles.previewButton}
            onPress={onFetchPreview}
            disabled={previewLoading || !editLoanAmount || !editInterestRate || !editLoanStartDate || !editLoanDueDate}
            data-testid="preview-loan-btn"
          >
            {previewLoading ? (
              <ActivityIndicator color="#4F46E5" size="small" />
            ) : (
              <>
                <Ionicons name="calculator-outline" size={18} color="#4F46E5" />
                <Text style={styles.previewButtonText}>
                  {t('calculatePreview')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {loanPreview && (
            <View style={styles.loanPreviewCard}>
              <Text style={styles.loanPreviewTitle}>
                {t('calculatedResults')}
              </Text>
              <View style={styles.loanPreviewGrid}>
                <View style={styles.loanPreviewItem}>
                  <Text style={styles.loanPreviewLabel}>{t('monthlyEmi')}</Text>
                  <Text style={styles.loanPreviewValue}>{'\u20AC'}{loanPreview.monthly_emi.toFixed(2)}</Text>
                </View>
                <View style={styles.loanPreviewItem}>
                  <Text style={styles.loanPreviewLabel}>{t('totalAmount')}</Text>
                  <Text style={styles.loanPreviewValue}>{'\u20AC'}{loanPreview.total_amount_due.toFixed(2)}</Text>
                </View>
                <View style={styles.loanPreviewItem}>
                  <Text style={styles.loanPreviewLabel}>{t('totalInterest')}</Text>
                  <Text style={[styles.loanPreviewValue, { color: '#F59E0B' }]}>{'\u20AC'}{loanPreview.total_interest.toFixed(2)}</Text>
                </View>
                <View style={styles.loanPreviewItem}>
                  <Text style={styles.loanPreviewLabel}>{t('tenure')}</Text>
                  <Text style={styles.loanPreviewValue}>
                    {loanPreview.tenure_months} {t('months')}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={onClose}
            >
              <Text style={styles.modalCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalConfirmButton]}
              onPress={onConfirm}
              disabled={actionLoading}
              data-testid="save-loan-btn"
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  </Modal>
);
