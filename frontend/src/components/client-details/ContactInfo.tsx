import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { Client } from './types';

interface Props {
  client: Client;
  language: string;
  t: (key: string) => string;
  onEdit: () => void;
}

export const ContactInfo = ({ client, language, t, onEdit }: Props) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{t('contactInfo')}</Text>
      <TouchableOpacity style={styles.editButton} onPress={onEdit} data-testid="edit-client-btn">
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
        {client.address || (language === 'et' ? 'Aadress puudub' : 'No address')}
      </Text>
    </View>
  </View>
);
