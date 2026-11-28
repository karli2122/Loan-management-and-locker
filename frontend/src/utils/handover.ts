import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CLIENT_APP_LINK_KEY, DEFAULT_CLIENT_APP_LINK } from '../constants/clientApp';

export async function getClientAppLink(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(CLIENT_APP_LINK_KEY);
    if (saved && /^https?:\/\//i.test(saved.trim())) return saved.trim();
  } catch {}
  return DEFAULT_CLIENT_APP_LINK;
}

export function buildHandoverMessage(opts: {
  name?: string;
  code: string;
  link: string;
  language: string;
}): string {
  const { name, code, link, language } = opts;
  if (language === 'et') {
    return [
      `PayLock – telefoni seadistamine${name ? ` (${name})` : ''}`,
      '',
      '1) Laadige alla ja paigaldage PayLock Client rakendus:',
      link,
      '(Kui Android näitab Play Protecti hoiatust, vajutage "Rohkem üksikasju" → "Installi ikkagi".)',
      '',
      '2) Avage rakendus ja sisestage see registreerimiskood:',
      code,
      '',
      '3) Järgige seadistuse samme ja lubage KÕIK load (seadme administraator, teavitused, ülekate teiste rakenduste peale, asukoht "Luba alati", juurdepääsetavus, aku). Ärge jätke ühtegi sammu vahele.',
      '',
      '4) Hoidke telefon internetiühenduses.',
      '',
      'Ärge kustutage rakendust ega lülitage lubasid välja – hilinenud makse korral telefon lukustatakse.',
    ].join('\n');
  }
  return [
    `PayLock – phone setup${name ? ` for ${name}` : ''}`,
    '',
    '1) Download and install the PayLock Client app:',
    link,
    '(If Android shows a Play Protect warning, tap "More details" → "Install anyway".)',
    '',
    '2) Open the app and enter this registration code:',
    code,
    '',
    '3) Follow the setup steps and allow EVERY permission (device admin, notifications, display over other apps, location "Allow all the time", accessibility, battery). Do not skip any step.',
    '',
    '4) Keep the phone connected to the internet.',
    '',
    'Do not uninstall the app or switch permissions off – the phone will be locked while a payment is overdue.',
  ].join('\n');
}

export async function shareHandover(opts: { name?: string; code: string; language: string }) {
  const link = await getClientAppLink();
  const message = buildHandoverMessage({ ...opts, link });
  try {
    await Share.share({ message });
  } catch {
    // user dismissed the sheet
  }
}
