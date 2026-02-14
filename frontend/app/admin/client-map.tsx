import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

interface ClientLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_locked: boolean;
  is_registered: boolean;
  phone: string;
  outstanding_balance: number;
  last_location_update: string;
}

export default function ClientMapScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const [locations, setLocations] = useState<ClientLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLocations = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) {
        router.replace('/admin/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/clients/locations?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setLocations(data.locations || []);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLocations();
    setRefreshing(false);
  }, []);

  const openInMaps = (lat: number, lng: number, name: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const formatLastUpdate = (dateString: string) => {
    if (!dateString) return language === 'et' ? 'Pole teada' : 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return language === 'et' ? 'Just nüüd' : 'Just now';
    if (minutes < 60) return `${minutes}m ${language === 'et' ? 'tagasi' : 'ago'}`;
    if (hours < 24) return `${hours}h ${language === 'et' ? 'tagasi' : 'ago'}`;
    return `${days}d ${language === 'et' ? 'tagasi' : 'ago'}`;
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {language === 'et' ? 'Klientide asukohad' : 'Client Locations'}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{locations.length}</Text>
        </View>
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Ionicons name="location" size={18} color="#10B981" />
          <Text style={styles.summaryText}>
            {locations.filter(l => !l.is_locked).length} {language === 'et' ? 'aktiivne' : 'active'}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Ionicons name="lock-closed" size={18} color="#EF4444" />
          <Text style={styles.summaryText}>
            {locations.filter(l => l.is_locked).length} {language === 'et' ? 'lukustatud' : 'locked'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
      >
        {locations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="location-outline" size={64} color="#334155" />
            <Text style={styles.emptyText}>
              {language === 'et' ? 'Asukohti pole' : 'No locations found'}
            </Text>
            <Text style={styles.emptySubtext}>
              {language === 'et' 
                ? 'Registreeritud seadmed ilmuvad siia'
                : 'Registered devices will appear here'}
            </Text>
          </View>
        ) : (
          locations.map((client) => (
            <TouchableOpacity
              key={client.id}
              style={[styles.locationCard, client.is_locked && styles.lockedCard]}
              onPress={() => router.push(`/admin/client-details?id=${client.id}`)}
              data-testid={`location-card-${client.id}`}
            >
              <View style={styles.locationHeader}>
                <View style={styles.locationIcon}>
                  <Ionicons
                    name={client.is_locked ? 'lock-closed' : 'location'}
                    size={20}
                    color={client.is_locked ? '#EF4444' : '#10B981'}
                  />
                </View>
                <View style={styles.locationInfo}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientPhone}>{client.phone}</Text>
                </View>
                {client.outstanding_balance > 0 && (
                  <View style={styles.balanceBadge}>
                    <Text style={styles.balanceText}>
                      €{client.outstanding_balance.toFixed(0)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.locationDetails}>
                <View style={styles.coordsContainer}>
                  <Text style={styles.coordsLabel}>
                    {language === 'et' ? 'Koordinaadid' : 'Coordinates'}
                  </Text>
                  <Text style={styles.coordsText}>
                    {client.latitude.toFixed(6)}, {client.longitude.toFixed(6)}
                  </Text>
                </View>
                <Text style={styles.lastUpdate}>
                  {language === 'et' ? 'Uuendatud' : 'Updated'}: {formatLastUpdate(client.last_location_update)}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.mapButton}
                onPress={() => openInMaps(client.latitude, client.longitude, client.name)}
              >
                <Ionicons name="map" size={18} color="#fff" />
                <Text style={styles.mapButtonText}>
                  {language === 'et' ? 'Ava kaardil' : 'Open in Maps'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  countBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#64748B',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#475569',
    marginTop: 8,
  },
  locationCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  lockedCard: {
    borderLeftColor: '#EF4444',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  clientPhone: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  locationDetails: {
    marginBottom: 12,
  },
  coordsContainer: {
    marginBottom: 4,
  },
  coordsLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  coordsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#64748B',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 8,
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
