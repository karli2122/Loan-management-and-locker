import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DatePicker } from '../../../components/DatePicker';
import { styles } from './styles';

// ─── Payment Modal ────────────────────────────────────────
interface PaymentModalProps {
  visible: boolean;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  paymentAmount: string;
  paymentMethod: string;
  paymentNotes: string;
  defaultEmi: number;
  onChangeAmount: (v: string) => void;
  onChangeMethod: (v: string) => void;
  onChangeNotes: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const PaymentModal = ({
  visible, language, t, actionLoading, paymentAmount, paymentMethod, paymentNotes,
  defaultEmi, onChangeAmount, onChangeMethod, onChangeNotes, onConfirm, onClose,
}: PaymentModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{language === 'et' ? 'Salvesta makse' : 'Record Payment'}</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{language === 'et' ? 'Summa (\u20AC)' : 'Amount (\u20AC)'}</Text>
          <TextInput
            style={styles.paymentInput}
            value={paymentAmount}
            onChangeText={onChangeAmount}
            placeholder={defaultEmi.toFixed(2)}
            keyboardType="decimal-pad"
            placeholderTextColor="#64748B"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{language === 'et' ? 'Makseviis' : 'Payment Method'}</Text>
          <View style={styles.methodButtons}>
            {['cash', 'bank_transfer', 'card'].map((method) => (
              <TouchableOpacity
                key={method}
                style={[styles.methodButton, paymentMethod === method && styles.methodButtonActive]}
                onPress={() => onChangeMethod(method)}
              >
                <Text style={[styles.methodButtonText, paymentMethod === method && styles.methodButtonTextActive]}>
                  {method === 'cash' ? (language === 'et' ? 'Sularaha' : 'Cash') :
                   method === 'bank_transfer' ? (language === 'et' ? '\u00DClekanne' : 'Transfer') :
                   (language === 'et' ? 'Kaart' : 'Card')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{language === 'et' ? 'M\u00E4rkmed (valikuline)' : 'Notes (Optional)'}</Text>
          <TextInput
            style={[styles.paymentInput, styles.textArea]}
            value={paymentNotes}
            onChangeText={onChangeNotes}
            placeholder={language === 'et' ? 'Makse m\u00E4rkmed...' : 'Payment notes...'}
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
            {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.modalConfirmText}>{language === 'et' ? 'Salvesta' : 'Record'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Warning Modal ────────────────────────────────────────
interface WarningModalProps {
  visible: boolean;
  t: (key: string) => string;
  actionLoading: boolean;
  warningMessage: string;
  onChangeMessage: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const WarningModal = ({
  visible, t, actionLoading, warningMessage, onChangeMessage, onConfirm, onClose,
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
            {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.modalConfirmText}>{t('send')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Lock Modal ───────────────────────────────────────────
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
  visible, t, actionLoading, lockMessage, onChangeMessage, onConfirm, onClose,
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
            {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.modalConfirmText}>{t('lock')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Edit Device Modal ────────────────────────────────────
interface EditDeviceModalProps {
  visible: boolean;
  t: (key: string) => string;
  actionLoading: boolean;
  make: string; model: string; price: string;
  onChangeMake: (v: string) => void;
  onChangeModel: (v: string) => void;
  onChangePrice: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditDeviceModal = ({
  visible, t, actionLoading, make, model, price,
  onChangeMake, onChangeModel, onChangePrice, onConfirm, onClose,
}: EditDeviceModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{t('editDeviceInfo')}</Text>
        {[
          { label: t('deviceMake'), value: make, onChange: onChangeMake, placeholder: t('deviceMake') },
          { label: t('deviceModel'), value: model, onChange: onChangeModel, placeholder: t('deviceModel') },
          { label: `${t('usedPrice')} (EUR)`, value: price, onChange: onChangePrice, placeholder: '0.00', keyboard: 'decimal-pad' as const },
        ].map((field) => (
          <View key={field.label} style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{field.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={field.value}
              onChangeText={field.onChange}
              placeholder={field.placeholder}
              placeholderTextColor="#64748B"
              keyboardType={field.keyboard}
            />
          </View>
        ))}
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
            {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Edit Client Modal ────────────────────────────────────
interface EditClientModalProps {
  visible: boolean;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  name: string; phone: string; email: string; address: string;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangeAddress: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditClientModal = ({
  visible, language, t, actionLoading, name, phone, email, address,
  onChangeName, onChangePhone, onChangeEmail, onChangeAddress, onConfirm, onClose,
}: EditClientModalProps) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>
          {language === 'et' ? 'Muuda kliendi andmeid' : 'Edit Client Info'}
        </Text>
        {[
          { label: language === 'et' ? 'Nimi' : 'Name', value: name, onChange: onChangeName, placeholder: language === 'et' ? 'Kliendi nimi' : 'Client name' },
          { label: language === 'et' ? 'Telefon' : 'Phone', value: phone, onChange: onChangePhone, placeholder: language === 'et' ? 'Telefoninumber' : 'Phone number', keyboard: 'phone-pad' as const },
          { label: language === 'et' ? 'E-post' : 'Email', value: email, onChange: onChangeEmail, placeholder: language === 'et' ? 'E-posti aadress' : 'Email address', keyboard: 'email-address' as const },
          { label: language === 'et' ? 'Aadress' : 'Address', value: address, onChange: onChangeAddress, placeholder: language === 'et' ? 'Aadress' : 'Address', testId: 'client-address-input' },
        ].map((field) => (
          <View key={field.label} style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{field.label}</Text>
            <TextInput
              style={styles.modalInput}
              value={field.value}
              onChangeText={field.onChange}
              placeholder={field.placeholder}
              placeholderTextColor="#64748B"
              keyboardType={field.keyboard}
              autoCapitalize={field.keyboard === 'email-address' ? 'none' : undefined}
              data-testid={field.testId}
            />
          </View>
        ))}
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
            {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

// ─── Edit Loan Modal ──────────────────────────────────────
interface EditLoanModalProps {
  visible: boolean;
  language: string;
  t: (key: string) => string;
  actionLoading: boolean;
  previewLoading: boolean;
  loanAmount: string;
  interestRate: string;
  startDate: string;
  dueDate: string;
  loanPreview: { monthly_emi: number; total_amount_due: number; tenure_months: number; total_interest: number } | null;
  onChangeLoanAmount: (v: string) => void;
  onChangeInterestRate: (v: string) => void;
  onChangeStartDate: (v: string) => void;
  onChangeDueDate: (v: string) => void;
  onPreview: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const EditLoanModal = ({
  visible, language, t, actionLoading, previewLoading, loanAmount, interestRate,
  startDate, dueDate, loanPreview, onChangeLoanAmount, onChangeInterestRate,
  onChangeStartDate, onChangeDueDate, onPreview, onConfirm, onClose,
}: EditLoanModalProps) => {
  const clearPreview = (fn: (v: string) => void) => (v: string) => { fn(v); };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <ScrollView contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {language === 'et' ? 'Muuda laenu tingimusi' : 'Edit Loan Terms'}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Laenusumma (\u20AC)' : 'Loan Amount (\u20AC)'}</Text>
              <TextInput
                style={styles.modalInput}
                value={loanAmount}
                onChangeText={clearPreview(onChangeLoanAmount)}
                placeholder="0.00"
                placeholderTextColor="#64748B"
                keyboardType="decimal-pad"
                data-testid="edit-loan-amount-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Intressim\u00E4\u00E4r kuus (%)' : 'Monthly Interest Rate (%)'}</Text>
              <TextInput
                style={styles.modalInput}
                value={interestRate}
                onChangeText={clearPreview(onChangeInterestRate)}
                placeholder="2.0"
                placeholderTextColor="#64748B"
                keyboardType="decimal-pad"
                data-testid="edit-loan-rate-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Laenu alguskuup\u00E4ev' : 'Loan Start Date'}</Text>
              <DatePicker
                value={startDate}
                onChange={onChangeStartDate}
                placeholder={language === 'et' ? 'Vali kuup\u00E4ev' : 'Select date'}
                testID="edit-loan-start-date-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Laenu t\u00E4htaeg' : 'Due Date'}</Text>
              <DatePicker
                value={dueDate}
                onChange={onChangeDueDate}
                placeholder={language === 'et' ? 'Vali kuup\u00E4ev' : 'Select date'}
                minDate={new Date()}
                testID="edit-loan-due-date-input"
              />
            </View>

            <TouchableOpacity
              style={styles.previewButton}
              onPress={onPreview}
              disabled={previewLoading || !loanAmount || !interestRate || !startDate || !dueDate}
              data-testid="preview-loan-btn"
            >
              {previewLoading ? <ActivityIndicator color="#4F46E5" size="small" /> : (
                <>
                  <Ionicons name="calculator-outline" size={18} color="#4F46E5" />
                  <Text style={styles.previewButtonText}>
                    {language === 'et' ? 'Arvuta eelvaade' : 'Calculate Preview'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {loanPreview && (
              <View style={styles.loanPreviewCard}>
                <Text style={styles.loanPreviewTitle}>
                  {language === 'et' ? 'Arvutatud tulemused' : 'Calculated Results'}
                </Text>
                <View style={styles.loanPreviewGrid}>
                  {[
                    { label: language === 'et' ? 'Kuumakse' : 'Monthly EMI', value: `\u20AC${loanPreview.monthly_emi.toFixed(2)}` },
                    { label: language === 'et' ? 'Kokku tagasimakse' : 'Total Amount', value: `\u20AC${loanPreview.total_amount_due.toFixed(2)}` },
                    { label: language === 'et' ? 'Intress kokku' : 'Total Interest', value: `\u20AC${loanPreview.total_interest.toFixed(2)}`, color: '#F59E0B' },
                    { label: language === 'et' ? 'Periood' : 'Tenure', value: `${loanPreview.tenure_months} ${language === 'et' ? 'kuud' : 'months'}` },
                  ].map((item) => (
                    <View key={item.label} style={styles.loanPreviewItem}>
                      <Text style={styles.loanPreviewLabel}>{item.label}</Text>
                      <Text style={[styles.loanPreviewValue, item.color ? { color: item.color } : undefined]}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={onConfirm}
                disabled={actionLoading}
                data-testid="save-loan-btn"
              >
                {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};
