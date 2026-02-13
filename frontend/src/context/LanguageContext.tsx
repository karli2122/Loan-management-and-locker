import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Language = 'et' | 'en';

interface Translations {
  [key: string]: {
    et: string;
    en: string;
  };
}

const translations: Translations = {
  // Home Screen
  appTitle: {
    et: 'Laenu lukustussüsteem',
    en: 'Loan Lock System',
  },
  appSubtitle: {
    et: 'Telefoni lukustuslahendus laenude jaoks',
    en: 'Phone Lock Management for Loans',
  },
  selectMode: {
    et: 'Vali režiim',
    en: 'Select Your Mode',
  },
  adminPanel: {
    et: 'Administraatori paneel',
    en: 'Admin Panel',
  },
  adminDescription: {
    et: 'Halda kliente, lukusta/ava seadmeid, saada hoiatusi ja jälgi asukohti',
    en: 'Manage clients, lock/unlock devices, send warnings, and track locations',
  },
  clientDevice: {
    et: 'Kliendi seade',
    en: 'Client Device',
  },
  clientDescription: {
    et: 'Registreeri oma seade, vaata laenu staatust ja halda oma kontot',
    en: 'Register your device, view loan status, and manage your account',
  },
  secureSystem: {
    et: 'Turvaline laenuhaldussüsteem',
    en: 'Secure Loan Management System',
  },

  // Admin Login
  adminLogin: {
    et: 'Administraatori sisselogimine',
    en: 'Admin Login',
  },
  signInToManage: {
    et: 'Logi sisse, et hallata oma kliente',
    en: 'Sign in to manage your clients',
  },
  username: {
    et: 'Kasutajanimi',
    en: 'Username',
  },
  password: {
    et: 'Parool',
    en: 'Password',
  },
  signIn: {
    et: 'Logi sisse',
    en: 'Sign In',
  },
  login: {
    et: 'Logi sisse',
    en: 'Login',
  },
  error: {
    et: 'Viga',
    en: 'Error',
  },
  fillAllFields: {
    et: 'Palun täida kõik väljad',
    en: 'Please fill in all fields',
  },
  ok: {
    et: 'OK',
    en: 'OK',
  },
  retry: {
    et: 'Proovi uuesti',
    en: 'Retry',
  },

  // Dashboard
  welcomeBack: {
    et: 'Tere tulemast tagasi,',
    en: 'Welcome back,',
  },
  dashboardOverview: {
    et: 'Ülevaade',
    en: 'Dashboard Overview',
  },
  totalClients: {
    et: 'Kliente kokku',
    en: 'Total Clients',
  },
  lockedDevices: {
    et: 'Lukustatud seadmed',
    en: 'Locked Devices',
  },
  registered: {
    et: 'Registreeritud',
    en: 'Registered',
  },
  unlocked: {
    et: 'Avatud',
    en: 'Unlocked',
  },
  quickActions: {
    et: 'Kiirtoimingud',
    en: 'Quick Actions',
  },
  copy: {
    et: 'Kopeeri',
    en: 'Copy',
  },
  copied: {
    et: 'Kood kopeeritud',
    en: 'Code copied',
  },
  viewClients: {
    et: 'Vaata kliente',
    en: 'View Clients',
  },
  manageClients: {
    et: 'Halda kõiki registreeritud kliente',
    en: 'Manage all registered clients',
  },
  addNewClient: {
    et: 'Lisa uus klient',
    en: 'Add New Client',
  },
  registerNewClient: {
    et: 'Registreeri uus klient',
    en: 'Register a new client',
  },
  logout: {
    et: 'Logi välja',
    en: 'Logout',
  },
  logoutConfirm: {
    et: 'Kas oled kindel, et soovid välja logida?',
    en: 'Are you sure you want to logout?',
  },
  cancel: {
    et: 'Tühista',
    en: 'Cancel',
  },

  // Clients List
  clients: {
    et: 'Kliendid',
    en: 'Clients',
  },
  searchPlaceholder: {
    et: 'Otsi nime, telefoni või e-posti järgi',
    en: 'Search by name, phone, or email',
  },
  all: {
    et: 'Kõik',
    en: 'All',
  },
  locked: {
    et: 'Lukustatud',
    en: 'Locked',
  },
  emi: {
    et: 'Laen',
    en: 'Loan',
  },
  pending: {
    et: 'Ootel',
    en: 'Pending',
  },
  code: {
    et: 'Kood',
    en: 'Code',
  },
  noClientsFound: {
    et: 'Kliente ei leitud',
    en: 'No clients found',
  },

  // Add Client
  fullName: {
    et: 'Täisnimi',
    en: 'Full Name',
  },
  enterClientName: {
    et: 'Sisesta kliendi nimi',
    en: "Enter client's name",
  },
  phoneNumber: {
    et: 'Telefoninumber',
    en: 'Phone Number',
  },
  enterPhone: {
    et: 'Sisesta telefoninumber',
    en: 'Enter phone number',
  },
  emailAddress: {
    et: 'E-posti aadress',
    en: 'Email Address',
  },
  enterEmail: {
    et: 'Sisesta e-posti aadress',
    en: 'Enter email address',
  },
  emiAmount: {
    et: 'Laenusumma',
    en: 'Loan Amount',
  },
  enterEmiAmount: {
    et: 'Sisesta laenusumma',
    en: 'Enter loan amount',
  },
  emiDueDate: {
    et: 'Laenu tähtaeg',
    en: 'Loan Due Date',
  },
  createClient: {
    et: 'Loo klient',
    en: 'Create Client',
  },
  registrationCodeInfo: {
    et: 'Genereeritakse unikaalne registreerimiskood. Jaga seda koodi kliendiga, et ta saaks oma seadme registreerida.',
    en: 'A unique registration code will be generated. Share this code with the client to register their device.',
  },
  success: {
    et: 'Õnnestus',
    en: 'Success',
  },
  clientCreated: {
    et: 'Klient loodud!',
    en: 'Client created!',
  },
  registrationCode: {
    et: 'Registreerimiskood',
    en: 'Registration Code',
  },
  shareCodeMessage: {
    et: 'Jaga seda koodi kliendiga, et ta saaks oma seadme registreerida.',
    en: 'Share this code with the client to register their device.',
  },

  // Client Details
  clientDetails: {
    et: 'Kliendi andmed',
    en: 'Client Details',
  },
  contactInfo: {
    et: 'Kontaktandmed',
    en: 'Contact Information',
  },
  emiDetails: {
    et: 'Laenu andmed',
    en: 'Loan Details',
  },
  amount: {
    et: 'Summa',
    en: 'Amount',
  },
  dueDate: {
    et: 'Tähtaeg',
    en: 'Due Date',
  },
  notSet: {
    et: 'Pole määratud',
    en: 'Not set',
  },
  deviceInfo: {
    et: 'Seadme info',
    en: 'Device Information',
  },
  viewLocationOnMap: {
    et: 'Vaata asukohta kaardil',
    en: 'View Location on Map',
  },
  locationNotAvailable: {
    et: 'Asukoht pole saadaval',
    en: 'Location not available',
  },
  deviceNotRegistered: {
    et: 'Seade pole veel registreeritud',
    en: 'Device not registered yet',
  },
  lockDevice: {
    et: 'Lukusta seade',
    en: 'Lock Device',
  },
  unlockDevice: {
    et: 'Ava seade',
    en: 'Unlock Device',
  },
  sendWarning: {
    et: 'Saada hoiatus',
    en: 'Send Warning',
  },
  enterWarningMessage: {
    et: 'Sisesta hoiatusteade',
    en: 'Enter warning message',
  },
  send: {
    et: 'Saada',
    en: 'Send',
  },
  customizeLockMessage: {
    et: 'Kohanda lukustusteadet, mis kuvatakse kliendile',
    en: 'Customize the lock message shown to the client',
  },
  enterLockMessage: {
    et: 'Sisesta lukustusteade',
    en: 'Enter lock message',
  },
  lock: {
    et: 'Lukusta',
    en: 'Lock',
  },
  deleteClient: {
    et: 'Kustuta klient',
    en: 'Delete Client',
  },
  deleteConfirm: {
    et: 'Kas oled kindel, et soovid selle kliendi kustutada? Seda toimingut ei saa tagasi võtta.',
    en: 'Are you sure you want to delete this client? This action cannot be undone.',
  },
  delete: {
    et: 'Kustuta',
    en: 'Delete',
  },
  deviceLockedSuccess: {
    et: 'Seade lukustatud edukalt',
    en: 'Device locked successfully',
  },
  deviceUnlockedSuccess: {
    et: 'Seade avatud edukalt',
    en: 'Device unlocked successfully',
  },
  warningSentSuccess: {
    et: 'Hoiatus saadetud edukalt',
    en: 'Warning sent successfully',
  },
  clientDeletedSuccess: {
    et: 'Klient kustutatud edukalt',
    en: 'Client deleted successfully',
  },
  unlockConfirm: {
    et: 'Kas oled kindel, et soovid selle seadme avada?',
    en: 'Are you sure you want to unlock this device?',
  },

  // Client Register
  registerDevice: {
    et: 'Registreeri seade',
    en: 'Register Device',
  },
  enterRegistrationCode: {
    et: 'Sisesta oma EMI pakkuja antud registreerimiskood, et siduda oma seade',
    en: 'Enter the registration code provided by your EMI provider to link your device',
  },
  enterCode: {
    et: 'Sisesta kood',
    en: 'Enter Code',
  },
  deviceInformation: {
    et: 'Seadme informatsioon',
    en: 'Device Information',
  },
  noCodeHelp: {
    et: 'Pole koodi? Võta ühendust oma EMI pakkujaga, et saada oma unikaalne registreerimiskood.',
    en: "Don't have a code? Contact your EMI provider to get your unique registration code.",
  },
  deviceRegisteredSuccess: {
    et: 'Seade registreeritud edukalt!',
    en: 'Device registered successfully!',
  },
  deviceAdminPermissionPrompt: {
    et: 'Seade registreeritud! Palun anna järgmises vaates Device Admin õigused, et seadistus lõpule viia.',
    en: 'Device registered! Please grant Device Admin permission in the next screen to complete setup.',
  },
  checkingRegistration: {
    et: 'Kontrollin registreerimist...',
    en: 'Checking registration...',
  },

  // Client Home
  welcome: {
    et: 'Tere tulemast,',
    en: 'Welcome,',
  },
  deviceStatus: {
    et: 'Seadme staatus',
    en: 'Device Status',
  },
  deviceActiveNormal: {
    et: 'Sinu seade on aktiivne ja töötab normaalselt',
    en: 'Your device is active and working normally',
  },
  monthlyEmi: {
    et: 'Igakuine EMI',
    en: 'Monthly EMI',
  },
  contactSupport: {
    et: 'Võta ühendust toega',
    en: 'Contact Support',
  },
  getHelp: {
    et: 'Saa abi oma kontoga',
    en: 'Get help with your account',
  },
  refreshStatus: {
    et: 'Värskenda staatust',
    en: 'Refresh Status',
  },
  checkForUpdates: {
    et: 'Kontrolli uuendusi',
    en: 'Check for updates',
  },
  warning: {
    et: 'Hoiatus',
    en: 'Warning',
  },
  loadingAccount: {
    et: 'Laadin sinu kontot...',
    en: 'Loading your account...',
  },

  // Lock Screen
  deviceLocked: {
    et: 'Seade lukustatud',
    en: 'Device Locked',
  },
  pendingAmount: {
    et: 'Võlgnevus',
    en: 'Pending Amount',
  },
  clearEmiToUnlock: {
    et: 'Palun tasu oma EMI võlgnevus, et avada oma seade',
    en: 'Please clear your pending EMI to unlock your device',
  },
  howToContact: {
    et: 'Kuidas soovid ühendust võtta?',
    en: 'How would you like to contact support?',
  },
  call: {
    et: 'Helista',
    en: 'Call',
  },
  email: {
    et: 'E-post',
    en: 'Email',
  },

  // Settings
  unregisterDevice: {
    et: 'Tühista seadme registreerimine',
    en: 'Unregister Device',
  },
  unregisterConfirm: {
    et: 'Kas oled kindel, et soovid selle seadme registreerimise tühistada? Pead uuesti registreerima uue koodiga.',
    en: 'Are you sure you want to unregister this device? You will need to re-register with a new code.',
  },
  unregister: {
    et: 'Tühista',
    en: 'Unregister',
  },

  // Language
  language: {
    et: 'Keel',
    en: 'Language',
  },
  estonian: {
    et: 'Eesti',
    en: 'Estonian',
  },
  english: {
    et: 'Inglise',
    en: 'English',
  },

  // Default lock message
  defaultLockMessage: {
    et: 'Teie seade on lukustatud tasumata EMI makse tõttu.',
    en: 'Your device has been locked due to pending EMI payment.',
  },

  // Stay signed in
  staySignedIn: {
    et: 'Hoia sisse logitud',
    en: 'Stay signed in',
  },

  // Settings Screen
  settings: {
    et: 'Seaded',
    en: 'Settings',
  },
  adminManagement: {
    et: 'Administraatori haldus',
    en: 'Admin Management',
  },
  createNewAdmin: {
    et: 'Loo uus administraator',
    en: 'Create New Admin',
  },
  newAdminUsername: {
    et: 'Uue administraatori kasutajanimi',
    en: 'New Admin Username',
  },
  newAdminPassword: {
    et: 'Uue administraatori parool',
    en: 'New Admin Password',
  },
  createAdmin: {
    et: 'Loo administraator',
    en: 'Create Admin',
  },
  changePassword: {
    et: 'Muuda parooli',
    en: 'Change Password',
  },
  currentPassword: {
    et: 'Praegune parool',
    en: 'Current Password',
  },
  newPassword: {
    et: 'Uus parool',
    en: 'New Password',
  },
  updatePassword: {
    et: 'Uuenda parooli',
    en: 'Update Password',
  },
  existingAdmins: {
    et: 'Olemasolevad administraatorid',
    en: 'Existing Admins',
  },
  adminCreatedSuccess: {
    et: 'Administraator loodud edukalt!',
    en: 'Admin created successfully!',
  },
  passwordChangedSuccess: {
    et: 'Parool muudetud edukalt!',
    en: 'Password changed successfully!',
  },
  passwordMinLength: {
    et: 'Parool peab olema vähemalt 6 tähemärki',
    en: 'Password must be at least 6 characters',
  },
  adminDeletedSuccess: {
    et: 'Administraator kustutatud edukalt',
    en: 'Admin deleted successfully',
  },
  deleteAdminConfirm: {
    et: 'Kas oled kindel, et soovid selle administraatori kustutada?',
    en: 'Are you sure you want to delete this admin?',
  },
  cannotDeleteSelf: {
    et: 'Te ei saa oma kontot kustutada',
    en: 'You cannot delete your own account',
  },
  createdAt: {
    et: 'Loodud',
    en: 'Created At',
  },
  devicePrice: {
    et: 'Seadme hind',
    en: 'Device Price',
  },
  fetchPrice: {
    et: 'Hangi hind',
    en: 'Fetch Price',
  },
  usedPrice: {
    et: 'Kasutatud hind',
    en: 'Used Price',
  },
  estimatedValue: {
    et: 'Hinnanguline väärtus',
    en: 'Estimated Value',
  },
  priceNotFetched: {
    et: 'Hinda pole veel hangitud',
    en: 'Price not fetched yet',
  },
  editDeviceInfo: {
    et: 'Muuda seadme infot',
    en: 'Edit Device Info',
  },
  deviceMake: {
    et: 'Tootja',
    en: 'Make',
  },
  deviceModel: {
    et: 'Mudel',
    en: 'Model',
  },
  price: {
    et: 'Hind',
    en: 'Price',
  },
  saveChanges: {
    et: 'Salvesta muudatused',
    en: 'Save Changes',
  },
  deviceInfoUpdated: {
    et: 'Seadme info uuendatud!',
    en: 'Device info updated!',
  },
  edit: {
    et: 'Muuda',
    en: 'Edit',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('et');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('app_language');
      if (savedLanguage === 'en' || savedLanguage === 'et') {
        setLanguageState(savedLanguage);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem('app_language', lang);
      setLanguageState(lang);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  };

  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key][language];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
