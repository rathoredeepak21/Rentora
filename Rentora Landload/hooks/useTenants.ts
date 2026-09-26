import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import db from '../utils/db';
import { Tenant, TenantStatus } from '../types';
import { tenantService } from '../services/tenantService';
import { useAuth } from './useAuth';

export const useTenants = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = useCallback(async (force = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (force) {
        db.clearCache('tenants');
      }
      const data = await tenantService.getTenants(user.uid);
      // Sort by tenant name
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setTenants(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchTenants();
    }, [fetchTenants])
  );

  const addTenant = async (
    tenantData: Omit<Tenant, 'ownerId' | 'status' | 'createdAt' | 'updatedAt'>,
    options?: { createLogin?: boolean; temporaryPassword?: string }
  ) => {
    if (!user) throw new Error('User not authenticated');
    const newTenant = await tenantService.createTenant(
      {
        ...tenantData,
        ownerId: user.uid,
      },
      options
    );
    setTenants(prev => [...prev, newTenant].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    return newTenant;
  };

  const updateTenant = async (id: string, tenantData: Partial<Tenant>) => {
    const updated = await tenantService.updateTenant(id, tenantData);
    setTenants(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  };

  const vacateTenant = async (id: string, moveOutDate: string) => {
    const updated = await tenantService.vacateTenant(id, moveOutDate);
    setTenants(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  };

  const searchTenants = async (query: string, status?: TenantStatus) => {
    if (!user) return;
    setLoading(true);
    try {
      const results = await tenantService.searchTenants(user.uid, query, status);
      setTenants(results);
    } catch (e: any) {
      setError(e.message || 'Failed to search tenants');
    } finally {
      setLoading(false);
    }
  };

  const deleteTenant = async (id: string) => {
    await tenantService.deleteTenant(id);
    setTenants(prev => prev.filter(t => t.id !== id));
  };

  return {
    tenants,
    loading,
    error,
    refresh: fetchTenants,
    addTenant,
    updateTenant,
    vacateTenant,
    searchTenants,
    deleteTenant,
  };
};
export default useTenants;
