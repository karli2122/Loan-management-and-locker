import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';


interface Admin {
  id: string;
  username: string;
  role: string;
  is_super_admin: boolean;
  created_at: string;
}

export default function AdminSettings() {
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  
  // Modal states
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Form states
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState('user'); // 'admin' or 'user'
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Profile edit states
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const adminId = await AsyncStorage.getItem('admin_id');
      const username = await AsyncStorage.getItem('admin_username');
      const role = await AsyncStorage.getItem('admin_role');
      const firstName = await AsyncStorage.getItem('admin_first_name');
      const lastName = await AsyncStorage.getItem('admin_last_name');
      
      setAdminToken(token);
      setCurrentAdminId(adminId);
      setCurrentUsername(username || '');
      setCurrentUserRole(role || 'user');
      setEditFirstName(firstName || '');
      setEditLastName(lastName || '');
      
      // Only fetch admin list if user is an admin
      if (token && role === 'admin') {
        await fetchAdmins(token);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/list?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setAdmins(data);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const handleAddAdmin = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newFirstName.trim() || !newLastName.trim()) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun täida kõik väljad' : 'Please fill all fields'
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Parool peab olema vähemalt 6 tähemärki' : 'Password must be at least 6 characters'
      );
      return;
    }

    setActionLoading(true);
    try {
      // Send admin_token as query parameter, not in the body
      const response = await fetch(`${API_URL}/api/admin/register?admin_token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: newUsername, 
          password: newPassword,
          first_name: newFirstName,
          last_name: newLastName,
          role: newUserRole 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to create user');
      }

      const roleText = newUserRole === 'admin' ? (language === 'et' ? 'administraator' : 'admin') : (language === 'et' ? 'kasutaja' : 'user');
      Alert.alert(
        language === 'et' ? 'Õnnestus' : 'Success',
        language === 'et' ? `Uus ${roleText} loodud` : `New ${roleText} created successfully`
      );
      
      setShowAddAdmin(false);
      setNewUsername('');
      setNewPassword('');
      setNewUserRole('user');
      setNewFirstName('');
      setNewLastName('');
      await fetchAdmins(adminToken!);
    } catch (error: any) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        error.message
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun täida kõik väljad' : 'Please fill all fields'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Paroolid ei kattu' : 'Passwords do not match'
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Uus parool peab olema vähemalt 6 tähemärki' : 'New password must be at least 6 characters'
      );
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/change-password?admin_token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          current_password: currentPassword, 
          new_password: newPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to change password');
      }

      Alert.alert(
        language === 'et' ? 'Õnnestus' : 'Success',
        language === 'et' ? 'Parool muudetud' : 'Password changed successfully'
      );
      
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        error.message
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAdmin = (admin: Admin) => {
    if (admin.id === currentAdminId) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Ei saa kustutada enda kontot' : 'Cannot delete your own account'
      );
      return;
    }

    Alert.alert(
      language === 'et' ? 'Kustuta administraator' : 'Delete Admin',
      language === 'et' 
        ? `Kas oled kindel, et soovid kustutada kasutaja "${admin.username}"?`
        : `Are you sure you want to delete "${admin.username}"?`,
      [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        {
          text: language === 'et' ? 'Kustuta' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(
                `${API_URL}/api/admin/${admin.id}?admin_token=${adminToken}`,
                { method: 'DELETE' }
              );

              if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to delete admin');
              }

              await fetchAdmins(adminToken!);
            } catch (error: any) {
              Alert.alert(
                language === 'et' ? 'Viga' : 'Error',
                error.message
              );
            }
          },
        },
      ]
    );
  };

  const handleUpdateProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Palun sisesta nimi' : 'Please enter your name'
      );
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/update-profile?admin_token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update profile');
      }

      // Update local storage
      await AsyncStorage.setItem('admin_first_name', editFirstName.trim());
      await AsyncStorage.setItem('admin_last_name', editLastName.trim());

      Alert.alert(
        language === 'et' ? 'Õnnestus' : 'Success',
        language === 'et' ? 'Profiil uuendatud' : 'Profile updated successfully'
      );
      
      setShowEditProfile(false);
    } catch (error: any) {
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        error.message
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      language === 'et' ? 'Logi välja' : 'Logout',
      language === 'et' ? 'Kas oled kindel?' : 'Are you sure?',
      [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        {
          text: language === 'et' ? 'Logi välja' : 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(['admin_token', 'admin_id', 'admin_username']);
            router.replace('/');
          },
        },
      ]
    );
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {language === 'et' ? 'Seaded' : 'Settings'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Current User Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? 'Sinu konto' : 'Your Account'}
          </Text>
          <View style={styles.userCard}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{currentUsername.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{editFirstName} {editLastName}</Text>
              <Text style={styles.userRole}>{language === 'et' ? 'Administraator' : 'Administrator'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowEditProfile(true)}
          >
            <Ionicons name="person" size={20} color="#4F46E5" />
            <Text style={styles.actionButtonText}>
              {language === 'et' ? 'Muuda profiili' : 'Edit Profile'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { marginTop: 8 }]}
            onPress={() => setShowChangePassword(true)}
          >
            <Ionicons name="key" size={20} color="#4F46E5" />
            <Text style={styles.actionButtonText}>
              {language === 'et' ? 'Muuda parooli' : 'Change Password'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? 'Keel' : 'Language'}
          </Text>
          <View style={styles.langContainer}>
            <TouchableOpacity
              style={[styles.langOption, language === 'et' && styles.langOptionActive]}
              onPress={() => setLanguage('et')}
            >
              <Text style={[styles.langText, language === 'et' && styles.langTextActive]}>Eesti</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langOption, language === 'en' && styles.langOptionActive]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>English</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Admin Management Section - Only for Admins */}
        {currentUserRole === 'admin' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {language === 'et' ? 'Kasutajahaldus' : 'User Management'}
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddAdmin(true)}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {admins.map((admin) => (
            <View key={admin.id} style={styles.adminCard}>
              <View style={styles.adminAvatarSmall}>
                <Text style={styles.adminAvatarText}>{admin.username.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.adminInfo}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Text style={styles.adminName}>{admin.username}</Text>
                  <View style={[styles.roleBadge, admin.role === 'admin' && styles.roleBadgeAdmin]}>
                    <Text style={styles.roleBadgeText}>
                      {admin.role === 'admin' ? (language === 'et' ? 'Admin' : 'Admin') : (language === 'et' ? 'Kasutaja' : 'User')}
                    </Text>
                  </View>
                  {admin.is_super_admin && (
                    <View style={styles.superAdminBadge}>
                      <Ionicons name="shield-checkmark" size={12} color="#F59E0B" />
                    </View>
                  )}
                </View>
                {admin.id === currentAdminId && (
                  <Text style={styles.youBadge}>{language === 'et' ? '(sina)' : '(you)'}</Text>
                )}
              </View>
              {admin.id !== currentAdminId && !admin.is_super_admin && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteAdmin(admin)}
                >
                  <Ionicons name="trash" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          </View>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>
            {language === 'et' ? 'Logi välja' : 'Logout'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Admin Modal */}
      <Modal visible={showAddAdmin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {language === 'et' ? 'Lisa administraator' : 'Add Administrator'}
            </Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Eesnimi' : 'First name'}
                placeholderTextColor="#64748B"
                value={newFirstName}
                onChangeText={setNewFirstName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Perekonnanimi' : 'Last name'}
                placeholderTextColor="#64748B"
                value={newLastName}
                onChangeText={setNewLastName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Kasutajanimi' : 'Username'}
                placeholderTextColor="#64748B"
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Parool' : 'Password'}
                placeholderTextColor="#64748B"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.roleSelector}>
              <Text style={styles.roleLabel}>
                {language === 'et' ? 'Roll' : 'Role'}
              </Text>
              <View style={styles.roleButtons}>
                <TouchableOpacity
                  style={[styles.roleButton, newUserRole === 'user' && styles.roleButtonActive]}
                  onPress={() => setNewUserRole('user')}
                >
                  <Ionicons 
                    name="person" 
                    size={18} 
                    color={newUserRole === 'user' ? '#fff' : '#64748B'} 
                  />
                  <Text style={[styles.roleButtonText, newUserRole === 'user' && styles.roleButtonTextActive]}>
                    {language === 'et' ? 'Kasutaja' : 'User'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleButton, newUserRole === 'admin' && styles.roleButtonActive]}
                  onPress={() => setNewUserRole('admin')}
                >
                  <Ionicons 
                    name="shield-checkmark" 
                    size={18} 
                    color={newUserRole === 'admin' ? '#fff' : '#64748B'} 
                  />
                  <Text style={[styles.roleButtonText, newUserRole === 'admin' && styles.roleButtonTextActive]}>
                    {language === 'et' ? 'Administraator' : 'Admin'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddAdmin(false);
                  setNewUsername('');
                  setNewPassword('');
                  setNewFirstName('');
                  setNewLastName('');
                  setNewUserRole('user');
                }}
              >
                <Text style={styles.cancelButtonText}>
                  {language === 'et' ? 'Tühista' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddAdmin}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {language === 'et' ? 'Lisa' : 'Add'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {language === 'et' ? 'Muuda parooli' : 'Change Password'}
            </Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Praegune parool' : 'Current password'}
                placeholderTextColor="#64748B"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="key" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Uus parool' : 'New password'}
                placeholderTextColor="#64748B"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="checkmark-circle" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Kinnita uus parool' : 'Confirm new password'}
                placeholderTextColor="#64748B"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowChangePassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.cancelButtonText}>
                  {language === 'et' ? 'Tühista' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleChangePassword}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {language === 'et' ? 'Muuda' : 'Change'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {language === 'et' ? 'Muuda profiili' : 'Edit Profile'}
            </Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Eesnimi' : 'First name'}
                placeholderTextColor="#64748B"
                value={editFirstName}
                onChangeText={setEditFirstName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Perekonnanimi' : 'Last name'}
                placeholderTextColor="#64748B"
                value={editLastName}
                onChangeText={setEditLastName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="mail" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'E-posti aadress' : 'Email address'}
                placeholderTextColor="#64748B"
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="call" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={language === 'et' ? 'Telefoninumber' : 'Phone number'}
                placeholderTextColor="#64748B"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditProfile(false)}
              >
                <Text style={styles.cancelButtonText}>
                  {language === 'et' ? 'Tühista' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleUpdateProfile}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {language === 'et' ? 'Salvesta' : 'Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    marginLeft: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  userRole: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  langContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  langOption: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langOptionActive: {
    borderColor: '#4F46E5',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  langText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#4F46E5',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  adminAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  adminInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 8,
  },
  adminName: {
    fontSize: 16,
    color: '#fff',
  },
  youBadge: {
    fontSize: 12,
    color: '#4F46E5',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    marginBottom: 12,
    height: 52,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#334155',
  },
  confirmButton: {
    backgroundColor: '#4F46E5',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  roleSelector: {
    marginTop: 16,
    marginBottom: 8,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#334155',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#6366F1',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#334155',
  },
  roleBadgeAdmin: {
    backgroundColor: '#4F46E520',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  superAdminBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
