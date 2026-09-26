import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { UserProfile, AuthContextType } from '../types';
import tenantAuthService from '../services/tenantAuthService';
import notificationService from '../services/notificationService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadUserProfile = async (firebaseUser: User) => {
    try {
      const profile = await tenantAuthService.fetchUserProfile(firebaseUser.uid);
      setUserProfile(profile);

      // Register push token for tenant device safely without blocking user session
      notificationService.registerForPushNotificationsAsync(firebaseUser.uid, profile.tenantId).catch(err => {
        console.warn('Background push token registration ignored:', err);
      });
    } catch (error: any) {
      console.warn('Tenant verification failed:', error.message);
      // Access denied or unlinked account: sign out immediately
      setUserProfile(null);
      await tenantAuthService.signOutTenant();
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          await loadUserProfile(firebaseUser);
        } catch (e) {
          setUser(null);
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (mobile: string, pass: string): Promise<void> => {
    setIsLoading(true);
    try {
      const userCredential = await tenantAuthService.signInTenant(mobile, pass);
      const firebaseUser = userCredential.user;
      setUser(firebaseUser);
      await loadUserProfile(firebaseUser);
    } catch (error) {
      setUser(null);
      setUserProfile(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePassword = async (newPass: string): Promise<void> => {
    if (!userProfile) {
      throw new Error('No tenant profile active.');
    }
    setIsLoading(true);
    try {
      await tenantAuthService.updateTenantPassword(newPass, userProfile.tenantId);
      // Update local profile state
      setUserProfile((prev) => (prev ? { ...prev, isFirstLogin: false } : null));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (user) {
        await notificationService.unregisterPushNotificationsAsync(user.uid, userProfile?.tenantId).catch(() => {});
      }
      await tenantAuthService.signOutTenant();
      setUser(null);
      setUserProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (user) {
      await loadUserProfile(user);
    }
  };

  const isAuthenticated = !!user && !!userProfile;
  const isFirstLogin = !!userProfile?.isFirstLogin;

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        isLoading,
        isAuthenticated,
        isFirstLogin,
        login,
        updatePassword,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
