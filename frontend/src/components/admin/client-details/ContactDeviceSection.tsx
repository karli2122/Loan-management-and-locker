import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import type { Client } from './types';

interface Props {
  client: Client;
  language: string;
  t: (key: string) => string;
  fetchingPrice: boolean;
  onEditClient: () => void;
  onEditDevice: () => void;
  onFetchPrice: () => void;
}

export const ContactDeviceSection = ({
  client, language, t, fetchingPrice, onEditClient, onEditDevice, onFetchPrice,
}: Props) => {
  const openMap = () => {
    if (client.latitude && client.longitude) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`);
    }
  };

  return (
    <>
      {/* Contact Info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('contactInfo')}</Text>
          <TouchableOpacity style={styles.editButton} onPress={onEditClient} data-testid="edit-client-btn">
            <Ionicons name="create-outline" size={18} color="#4F46E5" />
            <Text style={styles.editButtonText}>{t('edit')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="call" size={18} color="#64748B" />
          <Text style={styles.infoText} data-testid="client-phone-text">{client.phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="mail" size={18} color="#64748B" />
          <Text style={styles.infoText} data-testid="client-email-text">{client.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="home" size={18} color="#64748B" />
          <Text style={styles.infoText} data-testid="client-address-text">
            {client.address || (t('noAddress'))}
          </Text>
        </View>
      </View>

      {/* Device Info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('deviceInfo')}</Text>
          {client.is_registered && (
            <TouchableOpacity style={styles.editButton} onPress={onEditDevice}>
              <Ionicons name="create-outline" size={18} color="#4F46E5" />
              <Text style={styles.editButtonText}>{t('edit')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {client.is_registered ? (
          <>
            <View style={styles.infoRow}>
              <Ionicons name="phone-portrait" size={18} color="#64748B" />
              <Text style={styles.infoText}>{client.device_model || 'Unknown'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="finger-print" size={18} color="#64748B" />
              <Text style={styles.infoText}>{client.device_id || 'N/A'}</Text>
            </View>
            <TouchableOpacity style={styles.locationButton} onPress={openMap}>
              <Ionicons name="location" size={18} color="#3B82F6" />
              <Text style={styles.locationText}>
                {client.latitude ? t('viewLocationOnMap') : t('locationNotAvailable')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.notRegistered}>
            <Ionicons name="time" size={24} color="#F59E0B" />
            <Text style={styles.notRegisteredText}>{t('deviceNotRegistered')}</Text>
          </View>
        )}
      </View>

      {/* Device Price Section */}
      {client.is_registered && client.device_model && client.device_model !== 'Unknown Device' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('estimatedValue')}</Text>
            <TouchableOpacity style={styles.fetchPriceButton} onPress={onFetchPrice} disabled={fetchingPrice}>
              {fetchingPrice ? (
                <ActivityIndicator size="small" color="#4F46E5" />
              ) : (
                <>
                  <Ionicons name="sync" size={16} color="#4F46E5" />
                  <Text style={styles.fetchPriceText}>{t('fetchPrice')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {client.used_price_eur ? (
            <View style={styles.priceCard}>
              <View style={styles.priceIconContainer}>
                <Ionicons name="pricetag" size={32} color="#10B981" />
              </View>
              <View style={styles.priceInfo}>
                <Text style={styles.priceLabel}>{t('usedPrice')}</Text>
                <Text style={styles.priceValue}>{'\u20AC'}{client.used_price_eur.toFixed(2)}</Text>
                {client.price_fetched_at && (
                  <Text style={styles.priceDate}>{new Date(client.price_fetched_at).toLocaleDateString('et-EE')}</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.noPriceCard}>
              <Ionicons name="information-circle" size={24} color="#64748B" />
              <Text style={styles.noPriceText}>{t('priceNotFetched')}</Text>
            </View>
          )}
        </View>
      )}
    </>
  );
};
