import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import db from '../utils/db';
import { Bill } from '../types';
import { billService } from '../services/billService';
import { useAuth } from './useAuth';

export const useBills = () => {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBills = useCallback(async (force = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (force) {
        db.clearCache('bills');
      }
      const data = await billService.getBills(user.uid);
      // Sort bills by YYYY-MM desc, then billNumber desc
      data.sort((a, b) => {
        const monthComp = (b.billingMonth || '').localeCompare(a.billingMonth || '');
        if (monthComp !== 0) return monthComp;
        return (b.billNumber || '').localeCompare(a.billNumber || '');
      });
      setBills(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchBills();
    }, [fetchBills])
  );

  const searchBills = async (query: string, status?: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const results = await billService.searchBills(user.uid, query, status);
      // Sort results by billingMonth desc
      results.sort((a, b) => {
        const monthComp = (b.billingMonth || '').localeCompare(a.billingMonth || '');
        if (monthComp !== 0) return monthComp;
        return (b.billNumber || '').localeCompare(a.billNumber || '');
      });
      setBills(results);
    } catch (e: any) {
      setError(e.message || 'Failed to search bills');
    } finally {
      setLoading(false);
    }
  };

  return {
    bills,
    loading,
    error,
    refresh: fetchBills,
    searchBills,
  };
};
export default useBills;
