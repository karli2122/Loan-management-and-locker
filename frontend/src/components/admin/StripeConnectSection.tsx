import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import API_URL from '../../constants/api';

interface Props {
  adminToken: string | null;
  colors: any;
  t: (key: string) => string;
  formatAmount: (amount: number) => string;
}

export const StripeConnectSection = ({ adminToken, colors, t, formatAmount }: Props) => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [adminToken]);

  const fetchStatus = async () => {
    if (!adminToken) return;
    try {
      const resp = await fetch(`${API_URL}/api/connect/status?admin_token=${adminToken}`);
      if (resp.ok) setStatus(await resp.json());
    } catch (e) {
      console.error('Connect status error:', e);
    } finally {
      setLoading(false);
    }
  };

  const startOnboarding = async () => {
    if (!adminToken) return;
    setOnboarding(true);
    try {
      const resp = await fetch(`${API_URL}/api/connect/onboard?admin_token=${adminToken}`, { method: 'POST' });
      const data = await resp.json();
      if (data.status === 'already_connected') {
        Alert.alert('Already Connected', 'Your Stripe account is already connected and active.');
        fetchStatus();
      } else if (data.onboarding_url) {
        await Linking.openURL(data.onboarding_url);
      } else {
        Alert.alert('Error', data.detail || 'Failed to start onboarding');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to connect to Stripe');
    } finally {
      setOnboarding(false);
    }
  };

  if (loading) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isConnected = status?.status === 'active';
  const isPending = status?.status === 'pending';

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12, paddingHorizontal: 4 }}>
        Stripe Connect
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16 }}>
        {/* Status Indicator */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: isConnected ? '#10B981' : isPending ? '#F59E0B' : '#64748B',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons
              name={isConnected ? 'checkmark-circle' : isPending ? 'time' : 'card'}
              size={24} color="#fff"
            />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
              {isConnected ? 'Stripe Connected' : isPending ? 'Onboarding Pending' : 'Not Connected'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {isConnected
                ? 'Payments from clients are forwarded to your Stripe account'
                : isPending
                ? 'Complete the onboarding process to start receiving payments'
                : 'Connect your Stripe account to receive payments from clients'}
            </Text>
          </View>
        </View>

        {/* Platform Fee Info */}
        <View style={{
          backgroundColor: colors.background, borderRadius: 8, padding: 12,
          flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16,
        }}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Platform Fee</Text>
            <Text style={{ color: '#F59E0B', fontSize: 18, fontWeight: '700', marginTop: 4 }}>
              {status?.platform_fee_percent || 0.75}%
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Status</Text>
            <Text style={{
              color: isConnected ? '#10B981' : isPending ? '#F59E0B' : '#EF4444',
              fontSize: 14, fontWeight: '600', marginTop: 4,
            }}>
              {isConnected ? 'Active' : isPending ? 'Pending' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Action Button */}
        {isConnected ? (
          <View style={{
            backgroundColor: '#10B981', borderRadius: 8, padding: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
              Connected - Payments will be forwarded
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={{
              backgroundColor: '#6366F1', borderRadius: 8, padding: 14,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: onboarding ? 0.7 : 1,
            }}
            onPress={startOnboarding}
            disabled={onboarding}
            data-testid="connect-stripe-btn"
          >
            {onboarding ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="link" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {isPending ? 'Complete Onboarding' : 'Connect Stripe Account'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Info Text */}
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 12, textAlign: 'center' }}>
          When clients pay via payment links, funds go directly to your Stripe account minus a {status?.platform_fee_percent || 0.75}% platform fee.
        </Text>
      </View>
    </View>
  );
};

export default StripeConnectSection;
