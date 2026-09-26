import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import db from '../utils/db';
import { BillSettings } from '../types';
import { settingsService } from '../services/settingsService';
import { useAuth } from './useAuth';
import { updateUserProfile } from '../services/authService';

export const useSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BillSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async (force = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (force) {
        db.clearCache('settings');
      }
      const data = await settingsService.getSettings(user.uid);
      setSettings(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchSettings();
    }, [fetchSettings])
  );

  const updateSettings = async (settingsData: Omit<BillSettings, 'id' | 'updatedAt'>) => {
    if (!user) throw new Error('User not authenticated');
    const updated = await settingsService.saveSettings(user.uid, settingsData);
    setSettings(updated);
    
    try {
      await updateUserProfile(user.uid, {
        name: settingsData.ownerName,
        phone: settingsData.phone,
      });
    } catch (e) {
      console.error('Failed to sync settings updates to user profile:', e);
    }

    return updated;
  };

  return {
    settings,
    loading,
    error,
    refresh: fetchSettings,
    updateSettings,
  };
};
export default useSettings;
