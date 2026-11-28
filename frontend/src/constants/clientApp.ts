/**
 * Where borrowers download the PayLock Client app. The admin can override this in
 * Settings (stored in AsyncStorage under CLIENT_APP_LINK_KEY) when a newer build is shared.
 */
export const DEFAULT_CLIENT_APP_LINK =
  'https://drive.google.com/file/d/1laV-RHEfWD14LjFWWfzuFFpCwFb48mbb/view?usp=drivesdk';
export const CLIENT_APP_LINK_KEY = 'client_app_link';
