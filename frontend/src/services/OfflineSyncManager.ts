import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { hmacSha256Hex, timingSafeEqualHex } from '../utils/hmac';
import { deviceAuthHeaders, getDeviceToken } from '../utils/deviceAuth';

interface CachedStatus {
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  last_sync: number;
  pending_actions: PendingAction[];
}

interface PendingAction {
  type: 'lock' | 'unlock' | 'location' | 'tamper' | 'reboot';
  timestamp: number;
  data?: any;
}

const CACHE_KEY_PREFIX = 'offline_cache_';
const SYNC_INTERVAL = 30000; // 30 seconds

class OfflineSyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private isOnline: boolean = true;
  private onStatusUpdateCallback: ((status: any) => void) | null = null;
  private initialized: boolean = false;

  constructor() {
    // Defer network listener initialization to avoid crashes during module loading
    setTimeout(() => this.initializeNetworkListener(), 100);
  }

  private initializeNetworkListener() {
    try {
      // Monitor network status
      NetInfo.addEventListener(state => {
        const wasOffline = !this.isOnline;
        this.isOnline = state.isConnected ?? false;
        
        console.log('[OfflineSync] Network status:', this.isOnline ? 'ONLINE' : 'OFFLINE');
        
        // If we just came online, sync immediately
        if (wasOffline && this.isOnline) {
          console.log('[OfflineSync] Connection restored - syncing...');
          this.syncAll();
        }
      });
      this.initialized = true;
    } catch (error) {
      console.log('[OfflineSync] Failed to initialize network listener:', error);
      // Default to online mode if listener fails
      this.isOnline = true;
      this.initialized = true;
    }
  }

  /**
   * Verify the server's signed lock decision. Returns true only if the
   * signature matches HMAC(device_token, "clientId|isLocked|issuedAt") and the
   * timestamp is recent. Callers treat an unverified UNLOCK as "stay locked".
   */
  async verifyLockSignature(clientId: string, status: any): Promise<boolean> {
    try {
      const sig: string | undefined = status?.lock_signature;
      const issuedAt: number | undefined = status?.lock_issued_at;
      if (!sig || !issuedAt) return false;

      const nowSec = Math.floor(Date.now() / 1000);
      const isLock = !!status?.is_locked;
      // Unlocks must be fresh (10 min) so a captured payload cannot unlock later.
      // Locks may be slightly older — we still accept them if the HMAC matches
      // and issued_at is not in the future by more than 10 minutes.
      if (issuedAt - nowSec > 600) {
        console.warn('[OfflineSync] Lock signature timestamp is in the future');
        return false;
      }
      if (!isLock && Math.abs(nowSec - issuedAt) > 600) {
        console.warn('[OfflineSync] Unlock signature timestamp out of range');
        return false;
      }
      const lastIssued = await this.getLastVerifiedIssuedAt(clientId);
      if (lastIssued && issuedAt < lastIssued) {
        console.warn('[OfflineSync] Rejecting older lock payload (replay)');
        return false;
      }

      const devTok = await getDeviceToken();
      if (!devTok) return false;

      const isLockedInt = status?.is_locked ? 1 : 0;
      const expected = await hmacSha256Hex(devTok, `${clientId}|${isLockedInt}|${issuedAt}`);
      const ok = timingSafeEqualHex(expected, sig);
      if (ok) {
        await this.setLastVerifiedIssuedAt(clientId, issuedAt);
      }
      return ok;
    } catch (e) {
      console.warn('[OfflineSync] Lock signature verify error:', e);
      return false;
    }
  }

  async getCachedStatus(clientId: string): Promise<CachedStatus | null> {
    try {
      const cached = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${clientId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('[OfflineSync] Error reading cache:', error);
    }
    return null;
  }

  async setCachedStatus(clientId: string, status: any) {
    try {
      const cached = {
        ...status,
        last_sync: Date.now(),
        pending_actions: [],
      };
      
      await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${clientId}`, JSON.stringify(cached));
      console.log('[OfflineSync] Status cached successfully');
    } catch (error) {
      console.error('[OfflineSync] Error caching status:', error);
    }
  }

  async addPendingAction(clientId: string, action: PendingAction) {
    try {
      const cached = await this.getCachedStatus(clientId);
      if (cached) {
        cached.pending_actions.push(action);
        await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${clientId}`, JSON.stringify(cached));
        console.log('[OfflineSync] Pending action queued:', action.type);
      }
    } catch (error) {
      console.error('[OfflineSync] Error adding pending action:', error);
    }
  }

  async syncStatus(clientId: string, apiUrl: string): Promise<any> {
    try {
      // Check if online with timeout to prevent hanging
      let isOnline = false;
      try {
        const netPromise = NetInfo.fetch();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('NetInfo timeout')), 3000)
        );
        const netState = await Promise.race([netPromise, timeoutPromise]) as any;
        isOnline = netState?.isConnected ?? false;
      } catch {
        // If NetInfo hangs or fails, assume online and try fetch anyway
        isOnline = true;
      }
      
      if (!isOnline) {
        console.log('[OfflineSync] Offline - using cached status');
        const cached = await this.getCachedStatus(clientId);
        if (cached) {
          return {
            ...cached,
            offline: true,
          };
        }
        throw new Error('No cached data available');
      }

      // Online - fetch from server with retry logic for cold starts
      const maxRetries = 3;
      const baseTimeout = 12000; // 12s first try (handles cold start)
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        // Increase timeout on retries to give sleeping server time to wake
        const timeout = baseTimeout + (attempt * 5000);
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const devTok = await getDeviceToken();
          const response = await fetch(
            `${apiUrl}/api/device/status/${clientId}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json', ...deviceAuthHeaders(devTok) },
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const status = await response.json();

          // Verify the signed lock decision before trusting it. If the server
          // says "unlocked" but the signature is missing/invalid, we keep the
          // device locked — a MITM cannot forge an unlock.
          status._lock_verified = await this.verifyLockSignature(clientId, status);

          if (attempt > 0) {
            console.log(`[OfflineSync] API recovered on retry ${attempt}`);
          }

          // Never cache an unverified unlock over a previously locked state.
          if (status.is_locked === false && status._lock_verified !== true) {
            const existing = await this.getCachedStatus(clientId);
            if (existing?.is_locked) {
              return {
                ...existing,
                ...status,
                is_locked: true,
                lock_message: existing.lock_message || status.lock_message,
                _lock_verified: false,
                offline: false,
              };
            }
          } else {
            await this.setCachedStatus(clientId, status);
          }
          
          // Process pending actions
          await this.processPendingActions(clientId, apiUrl);
          
          return { ...status, offline: false };
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          lastError = fetchError;
          
          if (attempt < maxRetries) {
            // Wait before retry: 2s, 4s, 8s (exponential backoff)
            const delay = Math.pow(2, attempt + 1) * 1000;
            console.log(`[OfflineSync] Fetch failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      throw lastError || new Error('All retries exhausted');
    } catch (error) {
      console.error('[OfflineSync] Sync error after retries:', error);
      
      // Return cached data if available — include ALL fields for proper UI
      const cached = await this.getCachedStatus(clientId);
      if (cached) {
        return {
          ...cached,
          offline: true,
        };
      }
      
      throw error;
    }
  }

  async processPendingActions(clientId: string, apiUrl: string) {
    try {
      const cached = await this.getCachedStatus(clientId);
      if (!cached || cached.pending_actions.length === 0) {
        return;
      }

      console.log(`[OfflineSync] Processing ${cached.pending_actions.length} pending actions`);

      for (const action of cached.pending_actions) {
        try {
          switch (action.type) {
            case 'location': {
              const devTok = await getDeviceToken();
              await fetch(`${apiUrl}/api/device/location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...deviceAuthHeaders(devTok) },
                body: JSON.stringify({
                  client_id: clientId,
                  device_token: devTok || '',
                  ...action.data,
                }),
              });
              break;
            }

            case 'tamper': {
              const devTok = await getDeviceToken();
              await fetch(`${apiUrl}/api/clients/${clientId}/report-tamper?tamper_type=${action.data.type}`, {
                method: 'POST',
                headers: { ...deviceAuthHeaders(devTok) },
              });
              break;
            }

            case 'reboot': {
              const devTok = await getDeviceToken();
              await fetch(`${apiUrl}/api/clients/${clientId}/report-reboot`, {
                method: 'POST',
                headers: { ...deviceAuthHeaders(devTok) },
              });
              break;
            }
          }
          
          console.log(`[OfflineSync] Synced pending action: ${action.type}`);
        } catch (error) {
          console.error(`[OfflineSync] Failed to sync action ${action.type}:`, error);
        }
      }

      // Clear pending actions after successful sync
      cached.pending_actions = [];
      await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${clientId}`, JSON.stringify(cached));
      
    } catch (error) {
      console.error('[OfflineSync] Error processing pending actions:', error);
    }
  }

  async syncAll() {
    // This will be called when connection is restored
    console.log('[OfflineSync] Syncing all pending data...');
    
    try {
      // Get all cached client IDs
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
      
      for (const key of cacheKeys) {
        const clientId = key.replace(CACHE_KEY_PREFIX, '');
        // Trigger sync for each client
        // This will be called by the main app with proper API URL
      }
    } catch (error) {
      console.error('[OfflineSync] Error syncing all:', error);
    }
  }

  startPeriodicSync(clientId: string, apiUrl: string, onUpdate: (status: any) => void) {
    this.onStatusUpdateCallback = onUpdate;
    
    // Clear any existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Sync immediately
    this.syncStatus(clientId, apiUrl).then(status => {
      onUpdate(status);
    });

    // Set up periodic sync
    this.syncInterval = setInterval(async () => {
      try {
        const status = await this.syncStatus(clientId, apiUrl);
        onUpdate(status);
      } catch (error) {
        console.error('[OfflineSync] Periodic sync error:', error);
      }
    }, SYNC_INTERVAL);

    console.log('[OfflineSync] Periodic sync started');
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[OfflineSync] Periodic sync stopped');
    }
  }

  async reportLocationOffline(clientId: string, latitude: number, longitude: number) {
    const action: PendingAction = {
      type: 'location',
      timestamp: Date.now(),
      data: { latitude, longitude },
    };
    await this.addPendingAction(clientId, action);
  }

  async reportTamperOffline(clientId: string, tamperType: string) {
    const action: PendingAction = {
      type: 'tamper',
      timestamp: Date.now(),
      data: { type: tamperType },
    };
    await this.addPendingAction(clientId, action);
  }

  async reportRebootOffline(clientId: string) {
    const action: PendingAction = {
      type: 'reboot',
      timestamp: Date.now(),
    };
    await this.addPendingAction(clientId, action);
  }

  isDeviceOnline(): boolean {
    return this.isOnline;
  }

  private lastIssuedKey(clientId: string) {
    return `${CACHE_KEY_PREFIX}${clientId}_last_issued_at`;
  }

  async getLastVerifiedIssuedAt(clientId: string): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(this.lastIssuedKey(clientId));
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  async setLastVerifiedIssuedAt(clientId: string, issuedAt: number): Promise<void> {
    try {
      await AsyncStorage.setItem(this.lastIssuedKey(clientId), String(issuedAt));
    } catch (error) {
      console.log('[OfflineSync] Failed to persist issued_at', error);
    }
  }

  /**
   * Apply a signed lock/unlock decision from a push notification immediately,
   * without waiting for the next poll. Returns the merged status when the
   * signature verifies, or null if the payload must be ignored.
   */
  async applySignedPushPayload(clientId: string, data: any): Promise<any | null> {
    if (!data || (data.action !== 'lock' && data.action !== 'unlock')) {
      return null;
    }
    const candidate = {
      ...data,
      is_locked: data.action === 'lock' || data.is_locked === true || data.is_locked === 'true',
      lock_signature: data.lock_signature,
      lock_issued_at: typeof data.lock_issued_at === 'string'
        ? parseInt(data.lock_issued_at, 10)
        : data.lock_issued_at,
    };
    const verified = await this.verifyLockSignature(clientId, candidate);
    if (!verified) {
      console.warn('[OfflineSync] Ignoring unsigned or invalid lock push');
      return null;
    }
    const cached = (await this.getCachedStatus(clientId)) || {};
    const merged = {
      ...cached,
      ...candidate,
      _lock_verified: true,
      offline: false,
    };
    await this.setCachedStatus(clientId, merged);
    return merged;
  }
}

// Export singleton instance
export default new OfflineSyncManager();
