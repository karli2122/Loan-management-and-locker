import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import API_URL from '../constants/api';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
// Use the actual native build version code (set by EAS autoIncrement),
// not the static value from app.config.js which stays at 1.
const VERSION_CODE = Platform.OS === 'android'
  ? parseInt(Application.nativeBuildVersion || '1', 10)
  : (Constants.expoConfig?.ios?.buildNumber ? parseInt(Constants.expoConfig.ios.buildNumber, 10) : 1);

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
      }
    } catch {}
  };

  return { updateInfo, currentVersion: APP_VERSION, versionCode: VERSION_CODE, checkVersion };
}
