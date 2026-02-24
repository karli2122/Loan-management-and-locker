import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'no' | 'sv' | 'da' | 'fi' | 'et' | 'lv' | 'lt' | 'de_at' | 'cs' | 'pl' | 'de_ch' | 'es' | 'de' | 'fr' | 'it';

export interface LanguageOption {
  code: Language;
  name: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', flag: 'GB' },
  { code: 'no', name: 'Norsk', flag: 'NO' },
  { code: 'sv', name: 'Svenska', flag: 'SE' },
  { code: 'da', name: 'Dansk', flag: 'DK' },
  { code: 'fi', name: 'Suomi', flag: 'FI' },
  { code: 'et', name: 'Eesti', flag: 'EE' },
  { code: 'lv', name: 'Latvie\u0161u', flag: 'LV' },
  { code: 'lt', name: 'Lietuvi\u0173', flag: 'LT' },
  { code: 'de_at', name: '\u00D6sterreichisch', flag: 'AT' },
  { code: 'cs', name: '\u010Ce\u0161tina', flag: 'CZ' },
  { code: 'pl', name: 'Polski', flag: 'PL' },
  { code: 'de_ch', name: 'Schweizerdeutsch', flag: 'CH' },
  { code: 'es', name: 'Espa\u00F1ol', flag: 'ES' },
  { code: 'de', name: 'Deutsch', flag: 'DE' },
  { code: 'fr', name: 'Fran\u00E7ais', flag: 'FR' },
  { code: 'it', name: 'Italiano', flag: 'IT' },
];

// Translation entries: key -> { lang_code: translated_string }
// Falls back: current language -> de (for de_at/de_ch) -> en
const translations: Record<string, Partial<Record<Language, string>>> = {
  // ============ HOME SCREEN ============
  appTitle: {
    en: 'Loan Lock System', et: 'Laenu lukustuss\u00FCsteem', de: 'Kreditsperre-System', de_at: 'Kreditsperre-System', de_ch: 'Kreditsperre-System',
    fr: 'Syst\u00E8me de verrouillage de pr\u00EAt', es: 'Sistema de bloqueo de pr\u00E9stamo', it: 'Sistema di blocco prestito',
    no: 'L\u00E5nesperresystem', sv: 'L\u00E5nesp\u00E4rrsystem', da: 'L\u00E5nesp\u00E6rresystem', fi: 'Lainanlukitusjärjestelmä',
    lv: 'Aizdevuma blo\u0137\u0113\u0161anas sist\u0113ma', lt: 'Paskolos u\u017Erakinimo sistema', cs: 'Syst\u00E9m z\u00E1mku p\u016Fj\u010Dky', pl: 'System blokady po\u017Cyczki',
  },
  appSubtitle: {
    en: 'Phone Lock Management for Loans', et: 'Telefoni lukustuslahendus laenude jaoks',
    de: 'Telefonsperre-Verwaltung f\u00FCr Kredite', fr: 'Gestion du verrouillage t\u00E9l\u00E9phone pour pr\u00EAts',
    no: 'Telefonl\u00E5sh\u00E5ndtering for l\u00E5n', sv: 'Telefonl\u00E5shantering f\u00F6r l\u00E5n',
  },
  selectMode: { en: 'Select Your Mode', et: 'Vali re\u017Eiim', de: 'Modus w\u00E4hlen', fr: 'S\u00E9lectionnez votre mode', es: 'Seleccione su modo', it: 'Seleziona modalit\u00E0', no: 'Velg modus', sv: 'V\u00E4lj l\u00E4ge', da: 'V\u00E6lg tilstand', fi: 'Valitse tila', lv: 'Izv\u0113lieties re\u017E\u012Bmu', lt: 'Pasirinkite re\u017Eim\u0105', cs: 'Vyberte re\u017Eim', pl: 'Wybierz tryb' },
  adminPanel: { en: 'Admin Panel', et: 'Administraatori paneel', de: 'Admin-Panel', fr: 'Panneau admin', es: 'Panel de administraci\u00F3n', it: 'Pannello admin', no: 'Adminpanel', sv: 'Adminpanel', da: 'Adminpanel', fi: 'Hallintapaneeli' },
  adminDescription: { en: 'Manage clients, lock/unlock devices, send warnings, and track locations', et: 'Halda kliente, lukusta/ava seadmeid, saada hoiatusi ja j\u00E4lgi asukohti' },
  clientDevice: { en: 'Client Device', et: 'Kliendi seade', de: 'Kundengerät', fr: 'Appareil client', es: 'Dispositivo cliente', it: 'Dispositivo cliente', no: 'Klientenhet', sv: 'Klientenhet', da: 'Klientenhed', fi: 'Asiakaslaite' },
  clientDescription: { en: 'Register your device, view loan status, and manage your account', et: 'Registreeri oma seade, vaata laenu staatust ja halda oma kontot' },
  secureSystem: { en: 'Secure Loan Management System', et: 'Turvaline laenuhalduss\u00FCsteem' },

  // ============ AUTH ============
  adminLogin: { en: 'Admin Login', et: 'Administraatori sisselogimine', de: 'Admin-Anmeldung', fr: 'Connexion admin', es: 'Inicio de sesi\u00F3n admin', it: 'Login admin', no: 'Admin innlogging', sv: 'Admin inloggning', da: 'Admin login', fi: 'Ylläpitäjän kirjautuminen' },
  signInToManage: { en: 'Sign in to manage your clients', et: 'Logi sisse, et hallata oma kliente' },
  username: { en: 'Username', et: 'Kasutajanimi', de: 'Benutzername', fr: "Nom d'utilisateur", es: 'Usuario', it: 'Nome utente', no: 'Brukernavn', sv: 'Användarnamn', da: 'Brugernavn', fi: 'Käyttäjänimi', lv: 'Lietotājvārds', lt: 'Naudotojo vardas', cs: 'Uživatelské jméno', pl: 'Nazwa użytkownika' },
  password: { en: 'Password', et: 'Parool', de: 'Passwort', fr: 'Mot de passe', es: 'Contraseña', it: 'Password', no: 'Passord', sv: 'Lösenord', da: 'Adgangskode', fi: 'Salasana', lv: 'Parole', lt: 'Slaptažodis', cs: 'Heslo', pl: 'Hasło' },
  signIn: { en: 'Sign In', et: 'Logi sisse', de: 'Anmelden', fr: 'Se connecter', es: 'Iniciar sesi\u00F3n', it: 'Accedi', no: 'Logg inn', sv: 'Logga in', da: 'Log ind', fi: 'Kirjaudu', lv: 'Pieteikties', lt: 'Prisijungti', cs: 'Přihlásit', pl: 'Zaloguj się' },
  login: { en: 'Login', et: 'Logi sisse', de: 'Anmelden', fr: 'Connexion', es: 'Entrar', it: 'Accedi', no: 'Logg inn', sv: 'Logga in' },
  error: { en: 'Error', et: 'Viga', de: 'Fehler', fr: 'Erreur', es: 'Error', it: 'Errore', no: 'Feil', sv: 'Fel', da: 'Fejl', fi: 'Virhe', lv: 'Kļūda', lt: 'Klaida', cs: 'Chyba', pl: 'Błąd' },
  fillAllFields: { en: 'Please fill in all fields', et: 'Palun t\u00E4ida k\u00F5ik v\u00E4ljad', de: 'Bitte alle Felder ausfüllen', fr: 'Veuillez remplir tous les champs' },
  ok: { en: 'OK', et: 'OK', de: 'OK', fr: 'OK', es: 'OK', it: 'OK' },
  retry: { en: 'Retry', et: 'Proovi uuesti', de: 'Wiederholen', fr: 'Réessayer', es: 'Reintentar', it: 'Riprova', no: 'Prøv igjen', sv: 'Försök igen' },

  // ============ DASHBOARD ============
  welcomeBack: { en: 'Welcome back,', et: 'Tere tulemast tagasi,', de: 'Willkommen zurück,', fr: 'Bon retour,', es: 'Bienvenido de vuelta,', it: 'Bentornato,', no: 'Velkommen tilbake,', sv: 'Välkommen tillbaka,', da: 'Velkommen tilbage,', fi: 'Tervetuloa takaisin,' },
  dashboardOverview: { en: 'Dashboard Overview', et: '\u00DClevaade', de: 'Dashboard-Übersicht', fr: 'Aperçu du tableau de bord' },
  totalClients: { en: 'Total Clients', et: 'Kliente kokku', de: 'Kunden gesamt', fr: 'Total clients', es: 'Total clientes', it: 'Totale clienti', no: 'Totalt klienter', sv: 'Totalt klienter' },
  lockedDevices: { en: 'Locked Devices', et: 'Lukustatud seadmed', de: 'Gesperrte Geräte', fr: 'Appareils verrouillés' },
  registered: { en: 'Registered', et: 'Registreeritud', de: 'Registriert', fr: 'Enregistrés', es: 'Registrados', it: 'Registrati', no: 'Registrert', sv: 'Registrerade' },
  unlocked: { en: 'Unlocked', et: 'Avatud', de: 'Entsperrt', fr: 'Déverrouillés', es: 'Desbloqueados', it: 'Sbloccati', no: 'Ulåst', sv: 'Olåst' },
  quickActions: { en: 'Quick Actions', et: 'Kiirtoimingud', de: 'Schnellaktionen', fr: 'Actions rapides' },
  copy: { en: 'Copy', et: 'Kopeeri', de: 'Kopieren', fr: 'Copier', es: 'Copiar', it: 'Copia', no: 'Kopier', sv: 'Kopiera' },
  copied: { en: 'Code copied', et: 'Kood kopeeritud', de: 'Code kopiert', fr: 'Code copié' },
  viewClients: { en: 'View Clients', et: 'Vaata kliente', de: 'Kunden anzeigen', fr: 'Voir les clients' },
  manageClients: { en: 'Manage all registered clients', et: 'Halda k\u00F5iki registreeritud kliente' },
  addNewClient: { en: 'Add New Client', et: 'Lisa uus klient', de: 'Neuen Kunden hinzuf\u00FCgen', fr: 'Ajouter un nouveau client', es: 'Añadir nuevo cliente', it: 'Aggiungi nuovo cliente', no: 'Legg til ny klient', sv: 'Lägg till ny klient' },
  registerNewClient: { en: 'Register a new client', et: 'Registreeri uus klient' },
  logout: { en: 'Logout', et: 'Logi v\u00E4lja', de: 'Abmelden', fr: 'D\u00E9connexion', es: 'Cerrar sesi\u00F3n', it: 'Esci', no: 'Logg ut', sv: 'Logga ut', da: 'Log ud', fi: 'Kirjaudu ulos' },
  logoutConfirm: { en: 'Are you sure you want to logout?', et: 'Kas oled kindel, et soovid v\u00E4lja logida?', de: 'Möchten Sie sich wirklich abmelden?' },
  cancel: { en: 'Cancel', et: 'T\u00FChista', de: 'Abbrechen', fr: 'Annuler', es: 'Cancelar', it: 'Annulla', no: 'Avbryt', sv: 'Avbryt', da: 'Annuller', fi: 'Peruuta', lv: 'Atcelt', lt: 'Atšaukti', cs: 'Zrušit', pl: 'Anuluj' },

  // ============ CLIENTS ============
  clients: { en: 'Clients', et: 'Kliendid', de: 'Kunden', fr: 'Clients', es: 'Clientes', it: 'Clienti', no: 'Klienter', sv: 'Klienter', da: 'Klienter', fi: 'Asiakkaat' },
  searchPlaceholder: { en: 'Search by name, phone, or email', et: 'Otsi nime, telefoni v\u00F5i e-posti j\u00E4rgi' },
  all: { en: 'All', et: 'K\u00F5ik', de: 'Alle', fr: 'Tous', es: 'Todos', it: 'Tutti', no: 'Alle', sv: 'Alla', da: 'Alle', fi: 'Kaikki' },
  locked: { en: 'Locked', et: 'Lukustatud', de: 'Gesperrt', fr: 'Verrouillé', es: 'Bloqueado', it: 'Bloccato', no: 'Låst', sv: 'Låst' },
  emi: { en: 'Loan', et: 'Laen', de: 'Kredit', fr: 'Prêt', es: 'Préstamo', it: 'Prestito', no: 'Lån', sv: 'Lån', da: 'Lån', fi: 'Laina' },
  pending: { en: 'Pending', et: 'Ootel', de: 'Ausstehend', fr: 'En attente', es: 'Pendiente', it: 'In attesa', no: 'Ventende', sv: 'Väntande' },
  code: { en: 'Code', et: 'Kood', de: 'Code', fr: 'Code', es: 'C\u00F3digo', it: 'Codice', no: 'Kode', sv: 'Kod' },
  noClientsFound: { en: 'No clients found', et: 'Kliente ei leitud', de: 'Keine Kunden gefunden', fr: 'Aucun client trouvé' },

  // ============ ADD CLIENT ============
  fullName: { en: 'Full Name', et: 'T\u00E4isnimi', de: 'Vollst\u00E4ndiger Name', fr: 'Nom complet', es: 'Nombre completo', it: 'Nome completo', no: 'Fullt navn', sv: 'Fullständigt namn' },
  enterClientName: { en: "Enter client's name", et: 'Sisesta kliendi nimi' },
  phoneNumber: { en: 'Phone Number', et: 'Telefoninumber', de: 'Telefonnummer', fr: 'Numéro de téléphone', es: 'Número de teléfono', it: 'Numero di telefono', no: 'Telefonnummer', sv: 'Telefonnummer' },
  enterPhone: { en: 'Enter phone number', et: 'Sisesta telefoninumber' },
  emailAddress: { en: 'Email Address', et: 'E-posti aadress', de: 'E-Mail-Adresse', fr: 'Adresse e-mail' },
  enterEmail: { en: 'Enter email address', et: 'Sisesta e-posti aadress' },
  emiAmount: { en: 'Loan Amount', et: 'Laenusumma', de: 'Kreditbetrag', fr: 'Montant du prêt', es: 'Monto del préstamo', it: 'Importo del prestito', no: 'Lånebeløp', sv: 'Lånebelopp' },
  enterEmiAmount: { en: 'Enter loan amount', et: 'Sisesta laenusumma' },
  emiDueDate: { en: 'Loan Due Date', et: 'Laenu t\u00E4htaeg', de: 'Kreditfälligkeitsdatum', fr: 'Date d\u2019échéance' },
  createClient: { en: 'Create Client', et: 'Loo klient', de: 'Kunden erstellen', fr: 'Créer un client' },
  registrationCodeInfo: { en: 'A unique registration code will be generated. Share this code with the client to register their device.', et: 'Genereeritakse unikaalne registreerimiskood. Jaga seda koodi kliendiga, et ta saaks oma seadme registreerida.' },
  success: { en: 'Success', et: '\u00D5nnestus', de: 'Erfolg', fr: 'Succès', es: 'Éxito', it: 'Successo', no: 'Suksess', sv: 'Framgång' },
  clientCreated: { en: 'Client created!', et: 'Klient loodud!' },
  registrationCode: { en: 'Registration Code', et: 'Registreerimiskood', de: 'Registrierungscode', fr: 'Code d\u2019enregistrement' },
  shareCodeMessage: { en: 'Share this code with the client to register their device.', et: 'Jaga seda koodi kliendiga, et ta saaks oma seadme registreerida.' },

  // ============ CLIENT DETAILS ============
  clientDetails: { en: 'Client Details', et: 'Kliendi andmed', de: 'Kundendetails', fr: 'Détails du client' },
  contactInfo: { en: 'Contact Information', et: 'Kontaktandmed', de: 'Kontaktinformationen', fr: 'Informations de contact' },
  emiDetails: { en: 'Loan Details', et: 'Laenu andmed', de: 'Kreditdetails', fr: 'Détails du prêt' },
  amount: { en: 'Amount', et: 'Summa', de: 'Betrag', fr: 'Montant', es: 'Monto', it: 'Importo', no: 'Beløp', sv: 'Belopp' },
  dueDate: { en: 'Due Date', et: 'T\u00E4htaeg', de: 'Fälligkeitsdatum', fr: 'Date d\u2019échéance' },
  notSet: { en: 'Not set', et: 'Pole m\u00E4\u00E4ratud', de: 'Nicht festgelegt', fr: 'Non défini' },
  deviceInfo: { en: 'Device Information', et: 'Seadme info', de: 'Geräteinfo', fr: 'Informations sur l\u2019appareil' },
  viewLocationOnMap: { en: 'View Location on Map', et: 'Vaata asukohta kaardil' },
  locationNotAvailable: { en: 'Location not available', et: 'Asukoht pole saadaval' },
  deviceNotRegistered: { en: 'Device not registered yet', et: 'Seade pole veel registreeritud' },
  lockDevice: { en: 'Lock Device', et: 'Lukusta seade', de: 'Gerät sperren', fr: 'Verrouiller l\u2019appareil', es: 'Bloquear dispositivo', it: 'Blocca dispositivo', no: 'Lås enhet', sv: 'Lås enhet' },
  unlockDevice: { en: 'Unlock Device', et: 'Ava seade', de: 'Gerät entsperren', fr: 'Déverrouiller', es: 'Desbloquear', it: 'Sblocca', no: 'Lås opp enhet', sv: 'Lås upp enhet' },
  sendWarning: { en: 'Send Warning', et: 'Saada hoiatus', de: 'Warnung senden', fr: 'Envoyer un avertissement' },
  enterWarningMessage: { en: 'Enter warning message', et: 'Sisesta hoiatusteade' },
  send: { en: 'Send', et: 'Saada', de: 'Senden', fr: 'Envoyer', es: 'Enviar', it: 'Invia', no: 'Send', sv: 'Skicka' },
  customizeLockMessage: { en: 'Customize the lock message shown to the client', et: 'Kohanda lukustusteadet, mis kuvatakse kliendile' },
  enterLockMessage: { en: 'Enter lock message', et: 'Sisesta lukustusteade' },
  lock: { en: 'Lock', et: 'Lukusta', de: 'Sperren', fr: 'Verrouiller', es: 'Bloquear', it: 'Blocca' },
  deleteClient: { en: 'Delete Client', et: 'Kustuta klient', de: 'Kunden löschen', fr: 'Supprimer le client' },
  deleteConfirm: { en: 'Are you sure you want to delete this client? This action cannot be undone.', et: 'Kas oled kindel, et soovid selle kliendi kustutada? Seda toimingut ei saa tagasi v\u00F5tta.' },
  delete: { en: 'Delete', et: 'Kustuta', de: 'Löschen', fr: 'Supprimer', es: 'Eliminar', it: 'Elimina', no: 'Slett', sv: 'Radera' },
  deviceLockedSuccess: { en: 'Device locked successfully', et: 'Seade lukustatud edukalt' },
  deviceUnlockedSuccess: { en: 'Device unlocked successfully', et: 'Seade avatud edukalt' },
  warningSentSuccess: { en: 'Warning sent successfully', et: 'Hoiatus saadetud edukalt' },
  clientDeletedSuccess: { en: 'Client deleted successfully', et: 'Klient kustutatud edukalt' },
  unlockConfirm: { en: 'Are you sure you want to unlock this device?', et: 'Kas oled kindel, et soovid selle seadme avada?' },

  // ============ CLIENT REGISTRATION ============
  registerDevice: { en: 'Register Device', et: 'Registreeri seade', de: 'Gerät registrieren', fr: 'Enregistrer l\u2019appareil' },
  enterRegistrationCode: { en: 'Enter the registration code provided by your loan provider to link your device', et: 'Sisesta oma laenu pakkuja antud registreerimiskood, et siduda oma seade' },
  enterCode: { en: 'Enter Code', et: 'Sisesta kood', de: 'Code eingeben', fr: 'Entrez le code' },
  deviceInformation: { en: 'Device Information', et: 'Seadme informatsioon' },
  noCodeHelp: { en: "Don't have a code? Contact your loan provider to get your unique registration code.", et: 'Pole koodi? V\u00F5ta \u00FChendust oma laenu pakkujaga, et saada oma unikaalne registreerimiskood.' },
  deviceRegisteredSuccess: { en: 'Device registered successfully!', et: 'Seade registreeritud edukalt!' },
  deviceAdminPermissionPrompt: { en: 'Device registered! Please grant Device Admin permission in the next screen to complete setup.', et: 'Seade registreeritud! Palun anna j\u00E4rgmises vaates Device Admin \u00F5igused, et seadistus l\u00F5pule viia.' },
  checkingRegistration: { en: 'Checking registration...', et: 'Kontrollin registreerimist...' },

  // ============ CLIENT HOME ============
  welcome: { en: 'Welcome,', et: 'Tere tulemast,', de: 'Willkommen,', fr: 'Bienvenue,', es: 'Bienvenido,', it: 'Benvenuto,', no: 'Velkommen,', sv: 'Välkommen,' },
  deviceStatus: { en: 'Device Status', et: 'Seadme staatus', de: 'Gerätestatus', fr: 'Statut de l\u2019appareil' },
  deviceActiveNormal: { en: 'Your device is active and working normally', et: 'Sinu seade on aktiivne ja t\u00F6\u00F6tab normaalselt' },
  monthlyEmi: { en: 'Monthly EMI', et: 'Igakuine EMI', de: 'Monatliche Rate', fr: 'Mensualité' },
  contactSupport: { en: 'Contact Support', et: 'V\u00F5ta \u00FChendust toega', de: 'Support kontaktieren', fr: 'Contacter le support' },
  getHelp: { en: 'Get help with your account', et: 'Saa abi oma kontoga' },
  refreshStatus: { en: 'Refresh Status', et: 'V\u00E4rskenda staatust', de: 'Status aktualisieren', fr: 'Actualiser le statut' },
  checkForUpdates: { en: 'Check for updates', et: 'Kontrolli uuendusi' },
  warning: { en: 'Warning', et: 'Hoiatus', de: 'Warnung', fr: 'Avertissement', es: 'Advertencia', it: 'Avvertimento', no: 'Advarsel', sv: 'Varning' },
  loadingAccount: { en: 'Loading your account...', et: 'Laadin sinu kontot...' },

  // ============ LOCK SCREEN ============
  deviceLocked: { en: 'Device Locked', et: 'Seade lukustatud', de: 'Gerät gesperrt', fr: 'Appareil verrouillé', es: 'Dispositivo bloqueado', it: 'Dispositivo bloccato', no: 'Enhet låst', sv: 'Enhet låst' },
  pendingAmount: { en: 'Pending Amount', et: 'V\u00F5lgnevus', de: 'Ausstehender Betrag', fr: 'Montant en attente' },
  clearEmiToUnlock: { en: 'Please clear your pending loan balance to unlock your device', et: 'Palun tasu oma laenu v\u00F5lgnevus, et avada oma seade' },
  howToContact: { en: 'How would you like to contact support?', et: 'Kuidas soovid \u00FChendust v\u00F5tta?' },
  call: { en: 'Call', et: 'Helista', de: 'Anrufen', fr: 'Appeler', es: 'Llamar', it: 'Chiama', no: 'Ring', sv: 'Ring' },
  email: { en: 'Email', et: 'E-post', de: 'E-Mail', fr: 'E-mail', es: 'Correo', it: 'Email', no: 'E-post', sv: 'E-post' },

  // ============ SETTINGS ============
  settings: { en: 'Settings', et: 'Seaded', de: 'Einstellungen', fr: 'Paramètres', es: 'Configuración', it: 'Impostazioni', no: 'Innstillinger', sv: 'Inställningar', da: 'Indstillinger', fi: 'Asetukset' },
  language: { en: 'Language', et: 'Keel', de: 'Sprache', fr: 'Langue', es: 'Idioma', it: 'Lingua', no: 'Språk', sv: 'Språk', da: 'Sprog', fi: 'Kieli', lv: 'Valoda', lt: 'Kalba', cs: 'Jazyk', pl: 'Język' },
  currency: { en: 'Currency', et: 'Valuuta', de: 'Währung', fr: 'Devise', es: 'Moneda', it: 'Valuta', no: 'Valuta', sv: 'Valuta', da: 'Valuta', fi: 'Valuutta', lv: 'Valūta', lt: 'Valiuta', cs: 'Měna', pl: 'Waluta' },
  estonian: { en: 'Estonian', et: 'Eesti' },
  english: { en: 'English', et: 'Inglise' },
  unregisterDevice: { en: 'Unregister Device', et: 'T\u00FChista seadme registreerimine' },
  unregisterConfirm: { en: 'Are you sure you want to unregister this device? You will need to re-register with a new code.', et: 'Kas oled kindel, et soovid selle seadme registreerimise t\u00FChistada? Pead uuesti registreerima uue koodiga.' },
  unregister: { en: 'Unregister', et: 'T\u00FChista' },
  defaultLockMessage: { en: 'Your device has been locked due to pending loan payment.', et: 'Teie seade on maksmata laenumakse t\u00F5ttu lukustatud.' },
  staySignedIn: { en: 'Stay signed in', et: 'Hoia sisse logitud' },
  adminManagement: { en: 'Admin Management', et: 'Administraatori haldus' },
  createNewAdmin: { en: 'Create New Admin', et: 'Loo uus administraator' },
  newAdminUsername: { en: 'New Admin Username', et: 'Uue administraatori kasutajanimi' },
  newAdminPassword: { en: 'New Admin Password', et: 'Uue administraatori parool' },
  createAdmin: { en: 'Create Admin', et: 'Loo administraator' },
  changePassword: { en: 'Change Password', et: 'Muuda parooli', de: 'Passwort ändern', fr: 'Changer le mot de passe' },
  currentPassword: { en: 'Current Password', et: 'Praegune parool' },
  newPassword: { en: 'New Password', et: 'Uus parool' },
  updatePassword: { en: 'Update Password', et: 'Uuenda parooli' },
  existingAdmins: { en: 'Existing Admins', et: 'Olemasolevad administraatorid' },
  adminCreatedSuccess: { en: 'Admin created successfully!', et: 'Administraator loodud edukalt!' },
  passwordChangedSuccess: { en: 'Password changed successfully!', et: 'Parool muudetud edukalt!' },
  passwordMinLength: { en: 'Password must be at least 6 characters', et: 'Parool peab olema v\u00E4hemalt 6 t\u00E4hem\u00E4rki' },
  adminDeletedSuccess: { en: 'Admin deleted successfully', et: 'Administraator kustutatud edukalt' },
  deleteAdminConfirm: { en: 'Are you sure you want to delete this admin?', et: 'Kas oled kindel, et soovid selle administraatori kustutada?' },
  cannotDeleteSelf: { en: 'You cannot delete your own account', et: 'Te ei saa oma kontot kustutada' },
  createdAt: { en: 'Created At', et: 'Loodud' },

  // ============ DEVICE PRICE ============
  devicePrice: { en: 'Device Price', et: 'Seadme hind' },
  fetchPrice: { en: 'Fetch Price', et: 'Hangi hind', de: 'Preis abrufen', fr: 'Obtenir le prix' },
  usedPrice: { en: 'Used Price', et: 'Kasutatud hind' },
  estimatedValue: { en: 'Estimated Value', et: 'Hinnanguline v\u00E4\u00E4rtus', de: 'Geschätzter Wert', fr: 'Valeur estimée' },
  priceNotFetched: { en: 'Price not fetched yet', et: 'Hinda pole veel hangitud' },
  editDeviceInfo: { en: 'Edit Device Info', et: 'Muuda seadme infot' },
  deviceMake: { en: 'Make', et: 'Tootja' },
  deviceModel: { en: 'Model', et: 'Mudel' },
  price: { en: 'Price', et: 'Hind', de: 'Preis', fr: 'Prix', es: 'Precio', it: 'Prezzo', no: 'Pris', sv: 'Pris' },
  saveChanges: { en: 'Save Changes', et: 'Salvesta muudatused', de: 'Änderungen speichern', fr: 'Enregistrer' },
  deviceInfoUpdated: { en: 'Device info updated!', et: 'Seadme info uuendatud!' },
  edit: { en: 'Edit', et: 'Muuda', de: 'Bearbeiten', fr: 'Modifier', es: 'Editar', it: 'Modifica', no: 'Rediger', sv: 'Redigera' },
};

// German-based fallback languages
const germanFallbacks: Language[] = ['de_at', 'de_ch'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem('app_language');
      if (saved && LANGUAGES.some(l => l.code === saved)) {
        setLanguageState(saved as Language);
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
    const entry = translations[key];
    if (!entry) return key;

    // Try exact language match
    if (entry[language]) return entry[language]!;

    // Fallback for German variants -> German
    if (germanFallbacks.includes(language) && entry['de']) return entry['de']!;

    // Final fallback: English
    return entry['en'] || key;
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
