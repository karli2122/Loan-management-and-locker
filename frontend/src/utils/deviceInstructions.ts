import type { NativeDeviceInfo } from './DevicePolicy';

/**
 * Returns device-specific instructions and shortcut text for each permission.
 * Detects manufacturer/brand and Android version to give exact navigation paths.
 */

type PermInstructions = {
  title: string;
  steps: string;
  shortcut: string;
};

export function getAutoStartInstructions(dev: NativeDeviceInfo, lang: string): PermInstructions {
  const m = dev.manufacturer;
  const model = dev.model;
  const ver = dev.androidVersion;
  const isEt = lang === 'et';

  if (m.includes('samsung')) {
    return {
      title: isEt ? 'Taustapiirangutest vabastamine' : 'Remove Background Restrictions',
      steps: isEt
        ? `${model} (Android ${ver})\n\nAvaneb rakenduse teave leht.\n\n1. Puudutage "Aku"\n2. Valige "Piiranguteta"\n\nSee tagab, et rakendus töötab taustal.`
        : `${model} (Android ${ver})\n\nApp info page will open.\n\n1. Tap "Battery"\n2. Select "Unrestricted"\n\nThis ensures the app runs in the background.`,
      shortcut: isEt ? 'Ava rakenduse seaded' : 'Open App Settings',
    };
  }
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) {
    return {
      title: isEt ? 'Autostart' : 'Auto Start',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Rakendused > Autostart\n\nLeidke "Loan Client" ja lülitage SISSE`
        : `${model} (Android ${ver})\n\nSettings > Apps > Autostart\n\nFind "Loan Client" and turn ON`,
      shortcut: isEt ? 'Ava autostart' : 'Open Autostart',
    };
  }
  if (m.includes('oppo') || m.includes('realme')) {
    return {
      title: isEt ? 'Autostart' : 'Auto Start',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Rakenduste haldus > Autostart\n\nLeidke "Loan Client" ja lülitage SISSE`
        : `${model} (Android ${ver})\n\nSettings > App management > Auto-start\n\nFind "Loan Client" and turn ON`,
      shortcut: isEt ? 'Ava autostart' : 'Open Auto-start',
    };
  }
  if (m.includes('vivo')) {
    return {
      title: isEt ? 'Autostart' : 'Auto Start',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Rohkem seadeid > Rakendused > Autostart\n\nLeidke "Loan Client" ja lülitage SISSE`
        : `${model} (Android ${ver})\n\nSettings > More settings > Applications > Autostart\n\nFind "Loan Client" and turn ON`,
      shortcut: isEt ? 'Ava autostart' : 'Open Autostart',
    };
  }
  if (m.includes('huawei') || m.includes('honor')) {
    return {
      title: isEt ? 'Rakenduse käivitamine' : 'App Launch',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Aku > Rakenduse käivitamine\n\nLeidke "Loan Client" ja keelake automaatne haldus`
        : `${model} (Android ${ver})\n\nSettings > Battery > App launch\n\nFind "Loan Client" and disable automatic management`,
      shortcut: isEt ? 'Ava aku seaded' : 'Open Battery Settings',
    };
  }
  if (m.includes('oneplus')) {
    return {
      title: isEt ? 'Aku optimeerimine' : 'Battery Optimization',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Aku > Aku optimeerimine\n\nLeidke "Loan Client" ja valige "Ära optimeeri"`
        : `${model} (Android ${ver})\n\nSettings > Battery > Battery optimization\n\nFind "Loan Client" and select "Don't optimize"`,
      shortcut: isEt ? 'Ava aku seaded' : 'Open Battery Settings',
    };
  }
  // Stock Android / Other
  return {
    title: isEt ? 'Aku optimeerimine' : 'Battery Optimization',
    steps: isEt
      ? `${model} (Android ${ver})\n\nSeaded > Rakendused > Eriotsud > Aku optimeerimine\n\nLeidke "Loan Client" ja valige "Ära optimeeri"`
      : `${model} (Android ${ver})\n\nSettings > Apps > Special app access > Battery optimization\n\nFind "Loan Client" and select "Don't optimize"`,
    shortcut: isEt ? 'Ava aku seaded' : 'Open Battery Settings',
  };
}

export function getOverlayInstructions(dev: NativeDeviceInfo, lang: string): PermInstructions {
  const m = dev.manufacturer;
  const model = dev.model;
  const ver = dev.androidVersion;
  const isEt = lang === 'et';

  if (m.includes('samsung')) {
    return {
      title: isEt ? 'Ülekatte luba' : 'Display Over Other Apps',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Rakendused > Loan Client > Ilmuda teiste peale\n\nLülitage SISSE`
        : `${model} (Android ${ver})\n\nSettings > Apps > Loan Client > Display over other apps\n\nTurn ON`,
      shortcut: isEt ? 'Ava ülekatte seaded' : 'Open Overlay Settings',
    };
  }
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) {
    return {
      title: isEt ? 'Ülekatte luba' : 'Display Over Other Apps',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Rakendused > Halda rakendusi > Loan Client > Teised load\n\nLülitage SISSE`
        : `${model} (Android ${ver})\n\nSettings > Apps > Manage apps > Loan Client > Other permissions > Display pop-up windows\n\nTurn ON`,
      shortcut: isEt ? 'Ava ülekatte seaded' : 'Open Overlay Settings',
    };
  }
  if (m.includes('huawei') || m.includes('honor')) {
    return {
      title: isEt ? 'Ülekatte luba' : 'Display Over Other Apps',
      steps: isEt
        ? `${model} (Android ${ver})\n\nSeaded > Rakendused ja teated > Loan Client > Ilmuda teiste peale\n\nLülitage SISSE`
        : `${model} (Android ${ver})\n\nSettings > Apps & notifications > Loan Client > Display over other apps\n\nTurn ON`,
      shortcut: isEt ? 'Ava ülekatte seaded' : 'Open Overlay Settings',
    };
  }
  // Generic / Stock Android / OnePlus / Oppo / Vivo
  return {
    title: isEt ? 'Ülekatte luba' : 'Display Over Other Apps',
    steps: isEt
      ? `${model} (Android ${ver})\n\nSeaded > Rakendused > Eriotsud > Ilmuda teiste rakenduste peal\n\nLeidke "Loan Client" ja lülitage SISSE`
      : `${model} (Android ${ver})\n\nSettings > Apps > Special app access > Display over other apps\n\nFind "Loan Client" and turn ON`,
    shortcut: isEt ? 'Ava ülekatte seaded' : 'Open Overlay Settings',
  };
}

export function getAccessibilityInstructions(dev: NativeDeviceInfo, lang: string): PermInstructions {
  const m = dev.manufacturer;
  const model = dev.model;
  const ver = dev.androidVersion;
  const sdk = dev.sdkVersion;
  const isEt = lang === 'et';

  // Android 13+ (API 33+) needs restricted settings workaround for sideloaded apps
  const needsRestricted = sdk >= 33;

  const restrictedSteps = needsRestricted
    ? (isEt
      ? '\n\nKUIKUI ENNE:\nSeaded > Rakendused > Loan Client > (⋮) > Luba piiratud seaded'
      : '\n\nFIRST:\nSettings > Apps > Loan Client > (⋮) menu > Allow restricted settings')
    : '';

  if (m.includes('samsung')) {
    return {
      title: isEt ? 'Juurdepääsu teenus' : 'Accessibility Service',
      steps: isEt
        ? `${model} (Android ${ver})${restrictedSteps}\n\nSEEJÄREL:\nSeaded > Juurdepääs > Paigaldatud rakendused\n\nLeidke "Loan Client" ja lülitage SISSE`
        : `${model} (Android ${ver})${restrictedSteps}\n\nTHEN:\nSettings > Accessibility > Installed apps\n\nFind "Loan Client" and turn ON`,
      shortcut: isEt ? 'Ava juurdepääsu seaded' : 'Open Accessibility',
    };
  }
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) {
    return {
      title: isEt ? 'Juurdepääsu teenus' : 'Accessibility Service',
      steps: isEt
        ? `${model} (Android ${ver})${restrictedSteps}\n\nSEEJÄREL:\nSeaded > Täiendavad seaded > Juurdepääs > Allalaaditud rakendused\n\nLeidke "Loan Client" ja lülitage SISSE`
        : `${model} (Android ${ver})${restrictedSteps}\n\nTHEN:\nSettings > Additional settings > Accessibility > Downloaded apps\n\nFind "Loan Client" and turn ON`,
      shortcut: isEt ? 'Ava juurdepääsu seaded' : 'Open Accessibility',
    };
  }
  if (m.includes('huawei') || m.includes('honor')) {
    return {
      title: isEt ? 'Juurdepääsu teenus' : 'Accessibility Service',
      steps: isEt
        ? `${model} (Android ${ver})${restrictedSteps}\n\nSEEJÄREL:\nSeaded > Juurdepääs > Juurdepääsu teenused\n\nLeidke "Loan Client" ja lülitage SISSE`
        : `${model} (Android ${ver})${restrictedSteps}\n\nTHEN:\nSettings > Accessibility > Accessibility services\n\nFind "Loan Client" and turn ON`,
      shortcut: isEt ? 'Ava juurdepääsu seaded' : 'Open Accessibility',
    };
  }
  // Generic / Stock Android / OnePlus / Oppo / Vivo
  return {
    title: isEt ? 'Juurdepääsu teenus' : 'Accessibility Service',
    steps: isEt
      ? `${model} (Android ${ver})${restrictedSteps}\n\nSEEJÄREL:\nSeaded > Juurdepääs > Paigaldatud teenused\n\nLeidke "Loan Client" ja lülitage SISSE`
      : `${model} (Android ${ver})${restrictedSteps}\n\nTHEN:\nSettings > Accessibility > Installed services\n\nFind "Loan Client" and turn ON`,
    shortcut: isEt ? 'Ava juurdepääsu seaded' : 'Open Accessibility',
  };
}
