import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

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

  constructor() {
    this.initializeNetworkListener();
  }

  private initializeNetworkListener() {
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
      const cached: CachedStatus = {
        is_locked: status.is_locked,
        lock_message: status.lock_message || '',
        warning_message: status.warning_message || '',
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
      // Check if online
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        console.log('[OfflineSync] Offline - using cached status');
        const cached = await this.getCachedStatus(clientId);
        if (cached) {
          return {
            is_locked: cached.is_locked,
            lock_message: cached.lock_message,
            warning_message: cached.warning_message,
            offline: true,
          };
        }
        throw new Error('No cached data available');
      }

      // Online - fetch from server
      const response = await fetch(`${apiUrl}/api/device/status/${clientId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const status = await response.json();
      
      // Cache the new status
      await this.setCachedStatus(clientId, status);
      
      // Process pending actions
      await this.processPendingActions(clientId, apiUrl);
      
      return { ...status, offline: false };
    } catch (error) {
      console.error('[OfflineSync] Sync error:', error);
      
      // Return cached data if available
      const cached = await this.getCachedStatus(clientId);
      if (cached) {
        return {
          is_locked: cached.is_locked,
          lock_message: cached.lock_message,
          warning_message: cached.warning_message,
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
            case 'location':
              await fetch(`${apiUrl}/api/device/location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  client_id: clientId,
                  ...action.data,
                }),
              });
              break;

            case 'tamper':
              await fetch(`${apiUrl}/api/clients/${clientId}/report-tamper?tamper_type=${action.data.type}`, {
                method: 'POST',
              });
              break;

            case 'reboot':
              await fetch(`${apiUrl}/api/clients/${clientId}/report-reboot`, {
                method: 'POST',
              });
              break;
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
}

// Export singleton instance
export default new OfflineSyncManager();
