import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function Index() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={80} color="#4F46E5" />
        <Text style={styles.title}>EMI Lock System</Text>
        <Text style={styles.subtitle}>Phone Lock Management for EMI</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.selectText}>Select Your Mode</Text>
        
        <TouchableOpacity 
          style={[styles.modeCard, styles.adminCard]}
          onPress={() => router.push('/admin/login')}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="shield" size={40} color="#fff" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Admin Panel</Text>
            <Text style={styles.cardDescription}>
              Manage clients, lock/unlock devices, send warnings, and track locations
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.modeCard, styles.clientCard]}
          onPress={() => router.push('/client/register')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#059669' }]}>
            <Ionicons name="phone-portrait" size={40} color="#fff" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Client Device</Text>
            <Text style={styles.cardDescription}>
              Register your device, view EMI status, and manage your account
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Secure EMI Management System</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  selectText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 20,
    textAlign: 'center',
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  adminCard: {
    borderColor: '#4F46E5',
  },
  clientCard: {
    borderColor: '#059669',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#64748B',
  },
});
