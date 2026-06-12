import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

const PLAN_LEVELS: Record<string, number> = {
  starter: 0,
  professional: 1,
  business: 1, // legacy alias
  enterprise: 2,
  custom: 3,
};

interface PlanAccess {
  plan: string;
  isSuperAdmin: boolean;
  hasEnterprise: boolean;
  hasBusiness: boolean;
  loading: boolean;
  features: Record<string, boolean>;
  canAccess: (feature: string) => boolean;
}

export function useEnterpriseAccess(): PlanAccess {
  const [plan, setPlan] = useState('starter');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const token = await getSecureItem('admin_token');
        if (!token) { setLoading(false); return; }

        const res = await fetch(`${API_URL}/api/admin/feature-access?admin_token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setPlan(data.plan || 'starter');
          setFeatures(data.features || {});
          setIsSuperAdmin(data.plan === 'custom');
        } else {
          // Fallback to old endpoints
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
        }
      } catch (e) {
        console.error('useEnterpriseAccess error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const planLevel = PLAN_LEVELS[plan] ?? 0;
  const hasEnterprise = isSuperAdmin || planLevel >= PLAN_LEVELS.enterprise;
  const hasBusiness = isSuperAdmin || planLevel >= PLAN_LEVELS.professional;
  const hasProfessional = hasBusiness;

  const canAccess = (feature: string): boolean => {
    if (isSuperAdmin) return true;
    if (Object.keys(features).length > 0) {
      return features[feature] === true;
    }
    return true;
  };

  return { plan, isSuperAdmin, hasEnterprise, hasBusiness, hasProfessional, loading, features, canAccess };
}
