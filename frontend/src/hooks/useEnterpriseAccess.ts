import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../constants/api';

interface PlanAccess {
  plan: string;
  isSuperAdmin: boolean;
  hasEnterprise: boolean;
  loading: boolean;
}

const ENTERPRISE_PLANS = ['enterprise', 'custom'];

export function useEnterpriseAccess(): PlanAccess {
  const [plan, setPlan] = useState('starter');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('admin_token');
        if (!token) { setLoading(false); return; }

        const [planRes, creditsRes] = await Promise.all([
          fetch(`${API_URL}/api/payments/current-plan?admin_token=${token}`),
          fetch(`${API_URL}/api/admin/credits?admin_token=${token}`),
        ]);

        if (planRes.ok) {
          const data = await planRes.json();
          setPlan(data.plan_id || 'starter');
        }
        if (creditsRes.ok) {
          const data = await creditsRes.json();
          setIsSuperAdmin(data.is_super_admin === true);
        }
      } catch (e) {
        console.error('useEnterpriseAccess error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const hasEnterprise = isSuperAdmin || ENTERPRISE_PLANS.includes(plan);

  return { plan, isSuperAdmin, hasEnterprise, loading };
}
