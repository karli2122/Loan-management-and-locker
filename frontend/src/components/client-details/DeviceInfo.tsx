import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { Client } from './types';

interface Props {
  client: Client;
  colors: any;
  t: (key: string) => string;
  language: string;
  fetchingPrice: boolean;
  onEditDevice: () => void;
  onOpenMap: () => void;
  onFetchPrice: () => void;
}

export const DeviceInfo = ({
  client, colors, t, language, fetchingPrice, onEditDevice, onOpenMap, onFetchPrice,
}: Props) => (
  <>
    {/* Device Info */}
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('deviceInfo')}</Text>
        {client.is_registered && (
          <TouchableOpacity style={styles.editButton} onPress={onEditDevice}>
            <Ionicons name="create-outline" size={18} color="#2563EB" />
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
          <TouchableOpacity style={styles.locationButton} onPress={onOpenMap}>
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
          <TouchableOpacity
            style={styles.fetchPriceButton}
            onPress={onFetchPrice}
            disabled={fetchingPrice}
            data-testid="fetch-price-btn"
          >
            {fetchingPrice ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <Ionicons name="sync" size={16} color="#2563EB" />
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
              <Text style={styles.priceLabel}>
                {t('marketPriceMedian')}
              </Text>
              <Text style={styles.priceValue} data-testid="device-price-value">
                {'\u20AC'}{client.used_price_eur.toFixed(2)}
              </Text>
              {(client.price_min_eur != null && client.price_max_eur != null) && (
                <Text style={styles.priceRange}>
                  {'\u20AC'}{client.price_min_eur?.toFixed(0)} - {'\u20AC'}{client.price_max_eur?.toFixed(0)}
                </Text>
              )}
              <View style={styles.priceMetaRow}>
                {client.price_listing_count != null && client.price_listing_count > 0 && (
                  <View style={styles.priceMetaBadge}>
                    <Ionicons name="list" size={11} color="#64748B" />
                    <Text style={styles.priceMetaText}>
                      {client.price_listing_count} {t('listings')}
                    </Text>
                  </View>
                )}
                {client.price_source && (
                  <View style={styles.priceMetaBadge}>
                    <Ionicons name="globe" size={11} color="#64748B" />
                    <Text style={styles.priceMetaText}>{client.price_source}</Text>
                  </View>
                )}
              </View>
              {client.price_fetched_at && (
                <Text style={styles.priceDate}>
                  {new Date(client.price_fetched_at).toLocaleDateString('et-EE')}
                </Text>
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
