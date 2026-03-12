import { useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import API_URL from '../constants/api';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const VERSION_CODE = Constants.expoConfig?.android?.versionCode || 1;

interface VersionInfo {
  update_available: boolean;
  latest_version: string;
  latest_version_code: number;
  download_url: string;
  release_notes: string;
  force_update: boolean;
}

export function useVersionCheck(appType: 'admin' | 'client') {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    checkVersion();
  }, []);

  const checkVersion = async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/app-version/check?app_type=${appType}&current_version=${APP_VERSION}&current_code=${VERSION_CODE}`
      );
      if (!res.ok) return;
      const data: VersionInfo = await res.json();
      if (data.update_available) {
        setUpdateInfo(data);
        showUpdateAlert(data);
      }
    } catch {}
  };

  const showUpdateAlert = (info: VersionInfo) => {
    const buttons: any[] = [];
    if (!info.force_update) {
      buttons.push({ text: 'Later', style: 'cancel' });
    }
    if (info.download_url) {
      buttons.push({
        text: 'Update Now',
        onPress: () => {
          if (Platform.OS === 'android' && info.download_url) {
            Linking.openURL(info.download_url);
          }
        },
      });
    } else {
      buttons.push({ text: 'OK' });
    }

    Alert.alert(
      `Update Available (v${info.latest_version})`,
      info.release_notes || 'A new version is available. Please update for the best experience.',
      buttons,
      { cancelable: !info.force_update }
    );
  };

  return { updateInfo, currentVersion: APP_VERSION, versionCode: VERSION_CODE, checkVersion };
}
