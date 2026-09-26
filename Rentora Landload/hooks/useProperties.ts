import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import db from '../utils/db';
import { Property } from '../types';
import { propertyService } from '../services/propertyService';
import { useAuth } from './useAuth';

export const useProperties = () => {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperties = useCallback(async (force = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (force) {
        db.clearCache('properties');
      }
      const data = await propertyService.getProperties(user.uid);
      // Sort by name
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProperties(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchProperties();
    }, [fetchProperties])
  );

  const addProperty = async (propertyData: Omit<Property, 'ownerId' | 'createdAt' | 'updatedAt' | 'isDeleted'>) => {
    if (!user) throw new Error('User not authenticated');
    const newProperty = await propertyService.createProperty({
      ...propertyData,
      ownerId: user.uid,
      isDeleted: false,
    });
    setProperties(prev => [...prev, newProperty].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    return newProperty;
  };

  const updateProperty = async (id: string, propertyData: Partial<Property>) => {
    const updated = await propertyService.updateProperty(id, propertyData);
    setProperties(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  };

  const deleteProperty = async (id: string) => {
    await propertyService.deleteProperty(id);
    setProperties(prev => prev.filter(p => p.id !== id));
  };

  const searchProperties = async (query: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const results = await propertyService.searchProperties(user.uid, query);
      setProperties(results);
    } catch (e: any) {
      setError(e.message || 'Failed to search properties');
    } finally {
      setLoading(false);
    }
  };

  return {
    properties,
    loading,
    error,
    refresh: fetchProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    searchProperties,
  };
};
export default useProperties;
