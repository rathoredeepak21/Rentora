import { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import * as authService from '../services/authService';

export const useAuth = () => {
  const [user, setUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize Auth state from AsyncStorage
    let isMounted = true;
    
    authService.initAuth().then((loadedUser) => {
      if (isMounted) {
        setUser(loadedUser);
        setLoading(false);
      }
    });

    const unsubscribe = authService.subscribeAuthStateChanged((updatedUser) => {
      if (isMounted) {
        setUser(updatedUser);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setUser(null);
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    setLoading(true);
    try {
      const loggedUser = await authService.signInWithGoogle(idToken);
      setUser(loggedUser);
    } catch (e) {
      console.error('Google Sign-in error', e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    setLoading(true);
    try {
      const loggedUser = await authService.loginWithEmail(email, password);
      setUser(loggedUser);
      return loggedUser;
    } catch (e) {
      console.error('Email login error', e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (name: string, email: string, password: string, phone?: string) => {
    setLoading(true);
    try {
      const loggedUser = await authService.registerWithEmail(name, email, password, phone);
      setUser(loggedUser);
      return loggedUser;
    } catch (e) {
      console.error('Email registration error', e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    loading,
    logout,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
  };
};
