import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import API_URL from '../constants/api';
import { authedFetch } from '../utils/adminAuth';

/** Unread alert count for the bell badge. Keeps the last known value when a request fails. */
export function useAlertsBadge(intervalMs = 60000) {
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`${API_URL}/api/notifications?limit=1`);
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.unread_count === 'number') setUnread(data.unread_count);
    } catch {
      // keep the previous value
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, intervalMs);
      return () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      };
    }, [load, intervalMs]),
  );

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  return { unread, reload: load };
}
