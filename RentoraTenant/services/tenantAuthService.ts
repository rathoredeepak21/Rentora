import { 
  signInWithEmailAndPassword, 
  updatePassword, 
  signOut, 
  User, 
  UserCredential,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserProfile } from '../types';

export const formatTenantAuthEmail = (mobile: string): string => {
  const cleanMobile = mobile.replace(/[^0-9]/g, '');
  if (!cleanMobile) {
    throw new Error('Please enter a valid mobile number.');
  }
  return `${cleanMobile}@tenant.rentora.app`;
};

export const mapAuthErrorMessage = (error: any): string => {
  if (!error) return 'An unexpected error occurred.';
  const code = error.code || '';
  
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect mobile number or password. Please try again.';
    case 'auth/invalid-email':
      return 'Invalid tenant auth handle. Please contact support.';
    case 'auth/user-disabled':
      return 'Your tenant account has been disabled. Please contact your landlord.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again in a few minutes.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/requires-recent-login':
      return 'Security check required. Please re-enter your current password.';
    default:
      return error.message || 'Authentication error. Please try again.';
  }
};

export const tenantAuthService = {
  formatTenantAuthEmail,
  mapAuthErrorMessage,

  /**
   * Signs in a tenant using mobile number and password
   */
  async signInTenant(mobile: string, password: string): Promise<UserCredential> {
    if (!mobile.trim()) {
      throw new Error('Mobile number is required.');
    }
    if (!password) {
      throw new Error('Password is required.');
    }

    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    const primaryEmail = formatTenantAuthEmail(mobile);

    // 1. Direct login with primary clean email handle (e.g. 9876543210@tenant.rentora.app)
    try {
      return await signInWithEmailAndPassword(auth, primaryEmail, password);
    } catch (primaryErr: any) {
      // If code is wrong-password or user-not-found, check if a specific custom authEmail was set in Firestore
    }

    // 2. Lookup active tenant document by mobile to check for custom authEmail
    let customEmail: string | null = null;
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('phone', '==', cleanMobile));
      let querySnap = await getDocs(q);
      
      if (querySnap.empty) {
        q = query(usersRef, where('mobileNumber', '==', cleanMobile));
        querySnap = await getDocs(q);
      }

      if (!querySnap.empty) {
        const activeUserDoc = querySnap.docs.find(d => d.data().loginStatus === 'active') || querySnap.docs[0];
        const userDocData = activeUserDoc.data();
        if (userDocData.authEmail && userDocData.authEmail !== primaryEmail) {
          customEmail = userDocData.authEmail;
        }
      }
    } catch (e) {
      console.warn('Profile lookup for authEmail note:', e);
    }

    if (customEmail) {
      try {
        return await signInWithEmailAndPassword(auth, customEmail, password);
      } catch (customErr: any) {
        throw new Error(mapAuthErrorMessage(customErr));
      }
    }

    // 3. Re-run primary email to throw standard mapped error message
    try {
      return await signInWithEmailAndPassword(auth, primaryEmail, password);
    } catch (finalErr: any) {
      throw new Error(mapAuthErrorMessage(finalErr));
    }
  },

  /**
   * Fetches and validates the tenant profile from Firestore using Auth UID
   */
  async fetchUserProfile(uid: string): Promise<UserProfile> {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnapshot = await getDoc(userDocRef);

      if (!userSnapshot.exists()) {
        throw new Error('Your tenant account could not be found. Please contact your landlord.');
      }

      const data = userSnapshot.data() as UserProfile;

      if (data.role !== 'tenant') {
        throw new Error('This account is not registered as a tenant. Please contact your landlord.');
      }

      if (data.loginStatus === 'disabled') {
        throw new Error('Your tenant account has been disabled. Please contact your landlord.');
      }

      return {
        ...data,
        uid,
      };
    } catch (error: any) {
      if (error.message && error.message.includes('tenant account could not be found')) {
        throw error;
      }
      if (error.message && error.message.includes('disabled')) {
        throw error;
      }
      if (error.message && error.message.includes('not registered as a tenant')) {
        throw error;
      }
      throw new Error(mapAuthErrorMessage(error));
    }
  },

  /**
   * Updates password in Firebase Auth and updates isFirstLogin: false in Firestore
   */
  async updateTenantPassword(newPassword: string, tenantId?: string): Promise<void> {
    const currentUser: User | null = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated tenant found. Please log in again.');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    try {
      // 1. Update Firebase Auth Password
      await updatePassword(currentUser, newPassword);

      // 2. Update user profile document in Firestore
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        isFirstLogin: false,
        passwordResetRequested: false,
        loginPassword: newPassword,
        authSecret: newPassword,
        updatedAt: new Date().toISOString(),
      });

      // 3. Attempt to update tenant doc if tenantId is available
      if (tenantId) {
        try {
          const tenantDocRef = doc(db, 'tenants', tenantId);
          await updateDoc(tenantDocRef, {
            isFirstLogin: false,
            passwordResetRequested: false,
            loginPassword: newPassword,
            authSecret: newPassword,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.log('Note: Tenant document update skipped or limited by security rules.', e);
        }
      }
    } catch (error: any) {
      throw new Error(mapAuthErrorMessage(error));
    }
  },

  /**
   * Securely changes permanent password with current password re-authentication
   */
  async changePasswordWithReauth(currentPassword: string, newPassword: string): Promise<void> {
    const currentUser: User | null = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('No authenticated user session found.');
    }

    if (!currentPassword) {
      throw new Error('Current password is required.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }

    try {
      // 1. Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Update to new permanent password in Firebase Auth
      await updatePassword(currentUser, newPassword);

      // 3. Update loginPassword & authSecret in user doc
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
          loginPassword: newPassword,
          authSecret: newPassword,
          isFirstLogin: false,
          passwordResetRequested: false,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.log('Note: User document authSecret update skipped.', e);
      }
    } catch (error: any) {
      throw new Error(mapAuthErrorMessage(error));
    }
  },

  /**
   * Submits a password reset request flag to Firestore for landlord visibility
   */
  async requestPasswordReset(mobile: string): Promise<void> {
    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    if (!cleanMobile) {
      throw new Error('Please enter a valid mobile number.');
    }

    try {
      const { collection, query, where, getDocs, doc, updateDoc } = await import('firebase/firestore');
      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('phone', '==', cleanMobile));
      let querySnap = await getDocs(q);

      if (querySnap.empty) {
        q = query(usersRef, where('mobileNumber', '==', cleanMobile));
        querySnap = await getDocs(q);
      }

      if (querySnap.empty) {
        throw new Error('No tenant account found for this mobile number. Please check the number or contact your landlord.');
      }

      const userDoc = querySnap.docs[0];
      const userData = userDoc.data();
      const now = new Date().toISOString();

      await updateDoc(doc(db, 'users', userDoc.id), {
        passwordResetRequested: true,
        passwordResetRequestedAt: now,
        updatedAt: now,
      });

      if (userData.tenantId) {
        try {
          await updateDoc(doc(db, 'tenants', userData.tenantId), {
            passwordResetRequested: true,
            passwordResetRequestedAt: now,
            updatedAt: now,
          });
        } catch (e) {
          console.warn('Tenant doc reset flag update note:', e);
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('No tenant account found')) {
        throw err;
      }
      throw new Error('Failed to submit reset request. Please check your internet connection.');
    }
  },

  /**
   * Signs out the currently authenticated tenant
   */
  async signOutTenant(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error: any) {
      throw new Error(mapAuthErrorMessage(error));
    }
  },
};

export default tenantAuthService;
