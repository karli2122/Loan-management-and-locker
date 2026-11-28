import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import API_URL from '../constants/api';
import { getSecureItem } from './secureStorage';
import { authedFetch } from './adminAuth';

/**
 * The EXISTING loan contract flow: the server renders the contract PDF at
 * /api/contracts/{client_id}/download (needs a loan on the client). The deployed server requires
 * ?admin_token= on that URL, so the file is downloaded inside the app and shared from there.
 */
export async function shareLoanContract(
  clientId: string,
  language: string,
  dialogTitle?: string,
): Promise<{ ok: boolean; error?: string; needsLoan?: boolean }> {
  try {
    const token = await getSecureItem('admin_token');
    if (!token) return { ok: false, error: 'not_logged_in' };
    const url = `${API_URL}/api/contracts/${clientId}/download?admin_token=${encodeURIComponent(token)}&language=${language === 'et' ? 'et' : 'en'}`;
    const fileUri = `${FileSystem.cacheDirectory}loan-contract-${clientId}.pdf`;
    const res = await FileSystem.downloadAsync(url, fileUri);
    if (res.status === 401) {
      await authedFetch(`${API_URL}/api/admin/credits`); // lets the central session-expired handling run
      return { ok: false, error: 'session_expired' };
    }
    if (res.status && res.status >= 400) {
      let detail = '';
      try {
        const body = await FileSystem.readAsStringAsync(res.uri);
        detail = JSON.parse(body)?.detail || '';
      } catch {}
      const needsLoan = /no loan/i.test(String(detail));
      return { ok: false, needsLoan, error: detail || `HTTP ${res.status}` };
    }
    if (!(await Sharing.isAvailableAsync())) return { ok: false, error: 'sharing_unavailable' };
    await Sharing.shareAsync(res.uri, { mimeType: 'application/pdf', dialogTitle, UTI: 'com.adobe.pdf' });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'failed' };
  }
}
