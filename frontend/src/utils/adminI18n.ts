/**
 * Strings for the newer admin screens. The main LanguageContext is shared with the
 * client app, so these live here. English and Estonian are provided; other app
 * languages fall back to English.
 */
type Dict = Record<string, { en: string; et: string }>;

const S: Dict = {
  // bank statement -> add client
  addClientAction: { en: 'Add client', et: 'Lisa klient' },
  addClientFromStatement: { en: 'Add this person as a client', et: 'Lisa see isik kliendiks' },
  addClientFromStatementHint: { en: 'Opens the new-client form with name, address and personal ID filled in from the statement. Check everything before saving.', et: 'Avab uue kliendi vormi, kus nimi, aadress ja isikukood on väljavõttest täidetud. Kontrolli kõik üle enne salvestamist.' },
  readingStatement: { en: 'Reading the statement…', et: 'Loen väljavõtet…' },
  prefilledBanner: { en: 'Filled in from the bank statement – please check it. Anything we could not find is left empty.', et: 'Täidetud pangaväljavõtte põhjal – palun kontrolli üle. Mida ei leidnud, on tühi.' },
  firstName: { en: 'First name', et: 'Eesnimi' },
  lastName: { en: 'Last name', et: 'Perekonnanimi' },
  personalId: { en: 'Personal ID (isikukood)', et: 'Isikukood' },
  idOk: { en: 'Valid personal ID', et: 'Isikukood on korrektne' },
  idBad_format: { en: 'An Estonian personal ID has 11 digits', et: 'Eesti isikukood on 11-kohaline' },
  idBad_date: { en: 'The birth date inside this ID is not a real date', et: 'Isikukoodis olev sünniaeg ei ole päris kuupäev' },
  idBad_checksum: { en: 'Checksum does not match – there is probably a typo', et: 'Kontrollnumber ei klapi – tõenäoliselt on trükiviga' },
  idSaveAnyway: { en: 'The personal ID looks wrong. Save the client anyway?', et: 'Isikukood tundub vale. Salvestan kliendi sellegipoolest?' },
  saveAnyway: { en: 'Save anyway', et: 'Salvesta ikkagi' },
  fixIt: { en: 'Fix it', et: 'Paranda' },
  contractPromptTitle: { en: 'Generate loan contract?', et: 'Koosta laenuleping?' },
  contractPromptBody: { en: 'Create the loan contract PDF for {name} now, so it can be shared and signed.', et: 'Koosta kliendi {name} laenulepingu PDF kohe, et seda saaks jagada ja allkirjastada.' },
  contractYes: { en: 'Yes, generate contract', et: 'Jah, koosta leping' },
  contractNo: { en: 'Not now', et: 'Mitte praegu' },
  contractNeedsLoan: { en: 'A contract needs a loan first. Add the loan now? The contract is offered right after.', et: 'Lepingu jaoks on vaja laenu. Lisa laen nüüd? Leping pakutakse kohe pärast.' },
  addLoanNow: { en: 'Add loan', et: 'Lisa laen' },
  contractFailed: { en: 'Could not create the contract', et: 'Lepingut ei õnnestunud koostada' },
  contractWorking: { en: 'Creating the contract…', et: 'Koostan lepingut…' },
  statementTypeNote: { en: 'PDF, ASiC-E (.asice), CSV or XML', et: 'PDF, ASiC-E (.asice), CSV või XML' },
  // session
  sessionExpiredTitle: { en: 'Session expired', et: 'Seanss on aegunud' },
  sessionExpiredBody: {
    en: 'You were signed out for security (sessions last 24 hours). Your clients and loans are safe on the server. Log in again to continue.',
    et: 'Teid logiti turvalisuse huvides välja (seanss kestab 24 tundi). Teie kliendid ja laenud on serveris alles. Jätkamiseks logige uuesti sisse.',
  },
  logInAgain: { en: 'Log in again', et: 'Logi uuesti sisse' },
  // generic
  retry: { en: 'Retry', et: 'Proovi uuesti' },
  offlineBanner: { en: 'Cannot reach the server – showing the last loaded data.', et: 'Serveriga ei saa ühendust – näitan viimati laaditud andmeid.' },
  loadMore: { en: 'Load more', et: 'Näita rohkem' },
  noClients: { en: 'No clients match', et: 'Sobivaid kliente ei leitud' },
  // handover
  shareCode: { en: 'Share code & setup steps', et: 'Jaga koodi ja juhendit' },
  clientCreated: { en: 'Client created', et: 'Klient loodud' },
  codeReady: { en: 'Registration code', et: 'Registreerimiskood' },
  generateCodeFirst: {
    en: 'Client saved. Open the client and generate a registration code to share it.',
    et: 'Klient salvestatud. Avage klient ja looge registreerimiskood, et seda jagada.',
  },
  openClient: { en: 'Open client', et: 'Ava klient' },
  done: { en: 'Done', et: 'Valmis' },
  // lock sync
  lockApplied: { en: 'Lock applied – phone confirmed', et: 'Lukk rakendatud – telefon kinnitas' },
  lockPending: { en: 'Waiting for the phone to pick up the lock', et: 'Ootan, kuni telefon lukustuse kätte saab' },
  lockOffline: { en: 'Phone is offline – lock applies when it reconnects', et: 'Telefon on võrgust väljas – lukk rakendub ühenduse taastudes' },
  lockUnconfirmed: { en: 'Locked on the server – phone check-in seen', et: 'Serveris lukus – telefon on hiljuti ühendunud' },
  unlockedOk: { en: 'Unlocked', et: 'Lukustamata' },
  unlockPending: { en: 'Unlock sent – waiting for the phone', et: 'Avamine saadetud – ootan telefoni' },
  lastSeen: { en: 'Last seen', et: 'Viimati nähtud' },
  neverSeen: { en: 'Never connected', et: 'Pole kunagi ühendunud' },
  // chips
  chipTamper: { en: 'Tamper', et: 'Rikkumine' },
  chipTamperN: { en: 'tamper attempts', et: 'rikkumiskatset' },
  chipRebooted: { en: 'Rebooted', et: 'Taaskäivitatud' },
  chipAdminOff: { en: 'Device admin off', et: 'Seadme admin väljas' },
  chipPermission: { en: 'Permission revoked', et: 'Luba eemaldatud' },
  chipSilent: { en: 'Silent', et: 'Vaikne' },
  chipNotRegistered: { en: 'Not registered', et: 'Registreerimata' },
  chipLocked: { en: 'Locked', et: 'Lukus' },
  chipWarning: { en: 'Warning', et: 'Hoiatus' },
  // alerts
  alertsTitle: { en: 'Alerts', et: 'Teavitused' },
  alertsEmpty: { en: 'No alerts', et: 'Teavitusi pole' },
  markAllRead: { en: 'Mark all read', et: 'Märgi kõik loetuks' },
  // overdue queue
  queueTitle: { en: 'Overdue queue', et: 'Võlglaste järjekord' },
  queueEmpty: { en: 'Nobody is overdue 🎉', et: 'Hilinenud makseid pole 🎉' },
  daysLate: { en: 'days late', et: 'päeva hiljas' },
  dueTodayShort: { en: 'due today', et: 'tähtaeg täna' },
  callAction: { en: 'Call', et: 'Helista' },
  whatsappAction: { en: 'WhatsApp', et: 'WhatsApp' },
  warnAction: { en: 'Warn', et: 'Hoiata' },
  lockAction: { en: 'Lock', et: 'Lukusta' },
  payAction: { en: 'Payment', et: 'Makse' },
  selectAll: { en: 'Select all', et: 'Vali kõik' },
  clearSelection: { en: 'Clear', et: 'Tühista' },
  lockSelected: { en: 'Lock selected', et: 'Lukusta valitud' },
  warnSelected: { en: 'Warn selected', et: 'Hoiata valitud' },
  bulkDone: { en: 'Done', et: 'Valmis' },
  includeDueToday: { en: 'Include due today', et: 'Lisa tänased' },
  defaultWarning: {
    en: 'Your payment is overdue. Please pay as soon as possible to avoid your phone being locked.',
    et: 'Teie makse on hilinenud. Palun tasuge esimesel võimalusel, et vältida telefoni lukustamist.',
  },
  whatsappText: {
    en: 'Hello {name}, your payment of {amount} is overdue. Please pay as soon as possible.',
    et: 'Tere {name}, teie makse summas {amount} on hilinenud. Palun tasuge esimesel võimalusel.',
  },
  // sorting
  sortBy: { en: 'Sort', et: 'Sorteeri' },
  sortOverdue: { en: 'Most overdue', et: 'Enim hilinenud' },
  sortBalance: { en: 'Highest balance', et: 'Suurim jääk' },
  sortLastSeen: { en: 'Last seen (oldest first)', et: 'Viimati nähtud (vanim ees)' },
  sortName: { en: 'Name A–Z', et: 'Nimi A–Z' },
  filterTamper: { en: 'Tamper', et: 'Rikkumine' },
  filterUnregistered: { en: 'Not registered', et: 'Registreerimata' },
  // payments
  paymentDate: { en: 'Payment date', et: 'Makse kuupäev' },
  payDue: { en: 'Pay due', et: 'Tasu tähtaeg' },
  payFull: { en: 'Pay full', et: 'Tasu kogu jääk' },
  invalidAmount: { en: 'Enter a valid amount greater than 0.', et: 'Sisestage kehtiv summa, mis on suurem kui 0.' },
  amountTooHigh: { en: 'The amount is higher than the outstanding balance ({max}).', et: 'Summa on suurem kui järelejäänud saldo ({max}).' },
  receipt: { en: 'Receipt', et: 'Kviitung' },
  shareReceipt: { en: 'Share receipt', et: 'Jaga kviitungit' },
  paymentRecorded: { en: 'Payment recorded', et: 'Makse salvestatud' },
  fullyPaid: { en: 'Loan fully paid ✓', et: 'Laen täielikult makstud ✓' },
  paid: { en: 'Paid', et: 'Makstud' },
  outstanding: { en: 'Outstanding', et: 'Jääk' },
  balanceUnknown: { en: 'Balance will update after refresh', et: 'Saldo uueneb värskendamisel' },
  // delete
  deleteGuardTitle: { en: 'Delete client permanently?', et: 'Kustuta klient jäädavalt?' },
  deleteGuardRegistered: {
    en: 'This phone is still registered. If you delete the client first, the phone can no longer be unlocked from the app. Use "Allow uninstall" first, then delete.',
    et: 'See telefon on endiselt registreeritud. Kui kustutate kliendi enne, ei saa telefoni rakendusest enam avada. Kasutage esmalt "Luba eemaldamine" ja siis kustutage.',
  },
  deleteGuardType: { en: 'This also deletes the loan and payment history and cannot be undone. Type the client\'s name to confirm:', et: 'See kustutab ka laenu- ja maksete ajaloo ning seda ei saa tagasi võtta. Kinnitamiseks sisestage kliendi nimi:' },
  deleteForever: { en: 'Delete forever', et: 'Kustuta jäädavalt' },
  // update
  updateAvailable: { en: 'Update available', et: 'Uus versioon saadaval' },
  updateNow: { en: 'Update', et: 'Uuenda' },
  later: { en: 'Later', et: 'Hiljem' },
  // add client
  downPayment: { en: 'Down payment (deducted from the loan amount)', et: 'Sissemakse (arvatakse laenusummast maha)' },
  emailOptional: { en: 'Email (optional)', et: 'E-post (valikuline)' },
  duplicatePhoneTitle: { en: 'Client already exists', et: 'Klient on juba olemas' },
  duplicatePhoneBody: { en: 'A client with this phone number already exists: {name}.', et: 'Selle telefoninumbriga klient on juba olemas: {name}.' },
  createAnyway: { en: 'Create anyway', et: 'Loo ikkagi' },
  // settings
  clientAppLink: { en: 'Client app download link', et: 'Kliendirakenduse allalaadimise link' },
  clientAppLinkHint: { en: 'Sent to borrowers together with their registration code.', et: 'Saadetakse laenajatele koos registreerimiskoodiga.' },
  save: { en: 'Save', et: 'Salvesta' },
  // health
  deviceHealth: { en: 'Device health', et: 'Seadme seisukord' },
  lastCheckIn: { en: 'Last check-in', et: 'Viimane ühendus' },
  tamperLabel: { en: 'Tamper', et: 'Rikkumised' },
  lastReboot: { en: 'Last reboot', et: 'Viimane taaskäivitus' },
  deviceAdminLabel: { en: 'Device admin', et: 'Seadme admin' },
  active: { en: 'Active', et: 'Aktiivne' },
  inactive: { en: 'Inactive', et: 'Mitteaktiivne' },
  enrollment: { en: 'Enrollment', et: 'Registreerimise viis' },
  locationLabel: { en: 'Location', et: 'Asukoht' },
  battery: { en: 'Battery', et: 'Aku' },
};

export function ta(language: string, key: string, vars?: Record<string, string | number>): string {
  const e = S[key];
  let s = e ? (language === 'et' ? e.et : e.en) : key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}
