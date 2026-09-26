import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import db from '../utils/db';
import { Unit } from '../types';
import { unitService } from '../services/unitService';
import { useAuth } from './useAuth';

export const useUnits = (propertyId?: string) => {
  const { user } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUnits = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) {
        db.clearCache('units');
      }
      let data: Unit[] = [];
      if (propertyId) {
        data = await unitService.getUnits(propertyId);
      } else if (user) {
        data = await unitService.getUnitsByOwner(user.uid);
      }
      // Sort by unit number/name
      data.sort((a, b) => (a.unitNumber || '').localeCompare(b.unitNumber || '', undefined, { numeric: true }));
      setUnits(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch units');
    } finally {
      setLoading(false);
    }
  }, [propertyId, user]);

  useFocusEffect(
    useCallback(() => {
      fetchUnits();
    }, [fetchUnits])
  );

  const addUnit = async (unitData: Omit<Unit, 'ownerId' | 'propertyId' | 'status' | 'currentTenantId' | 'createdAt' | 'updatedAt'>, targetPropertyId: string) => {
    if (!user) throw new Error('User not authenticated');
    const newUnit = await unitService.createUnit({
      ...unitData,
      ownerId: user.uid,
      propertyId: targetPropertyId,
      status: 'vacant',
      currentTenantId: null,
    });
    setUnits(prev => [...prev, newUnit].sort((a, b) => (a.unitNumber || '').localeCompare(b.unitNumber || '', undefined, { numeric: true })));
    return newUnit;
  };

  const updateUnit = async (id: string, unitData: Partial<Unit>) => {
    const updated = await unitService.updateUnit(id, unitData);
    setUnits(prev => prev.map(u => u.id === id ? updated : u));
    return updated;
  };

  const deleteUnit = async (id: string) => {
    await unitService.deleteUnit(id);
    setUnits(prev => prev.filter(u => u.id !== id));
  };

  return {
    units,
    loading,
    error,
    refresh: fetchUnits,
    addUnit,
    updateUnit,
    deleteUnit,
  };
};
export default useUnits;
