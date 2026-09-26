import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { app as primaryApp, db, auth as primaryAuth } from '../firebase/config';
import { TenantLoginStatus } from '../types';

export const formatTenantAuthEmail = (mobile: string): string => {
  const cleanMobile = mobile.replace(/[^0-9]/g, '');
  if (!cleanMobile) {
    throw new Error('Invalid mobile number provided for tenant login.');
  }
  return `${cleanMobile}@tenant.rentora.app`;
};

export interface CreateTenantAuthParams {
  tenantId: string;
  mobile: string;
  temporaryPassword: string;
  ownerId: string;
  propertyId: string;
  unitId: string;
  tenantName: string;
}

export const tenantAuthService = {
  /**
   * Creates a new Firebase Auth user account for a tenant using the Firebase Auth REST API.
   * This completely avoids initializing secondary JS auth instances or triggering primary app auth state listeners.
   */
  async createTenantAuthAccount(params: CreateTenantAuthParams): Promise<{ tenantAuthUid: string; email: string }> {
    const { tenantId, mobile, temporaryPassword, ownerId, propertyId, unitId, tenantName } = params;

    if (!temporaryPassword || temporaryPassword.length < 6) {
      throw new Error('Temporary password must be at least 6 characters long.');
    }

    const currentLandlordUid = primaryAuth?.currentUser?.uid;
    const effectiveOwnerId = ownerId || currentLandlordUid;
    if (!effectiveOwnerId) {
      console.error('[TenantAuth] Landlord UID missing. primaryAuth.currentUser:', primaryAuth?.currentUser);
      throw new Error('Landlord authentication error: Missing owner ID or unauthenticated session.');
    }

    const email = formatTenantAuthEmail(mobile);
    const apiKey = primaryApp.options.apiKey;

    if (!apiKey) {
      throw new Error('Firebase API key missing in config.');
    }

    let tenantAuthUid: string;

    // 1. Create Tenant Auth user via Firebase Auth REST API
    try {
      console.log(`[TenantAuth] Creating Auth user via REST API for email: ${email}`);
      const restResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: temporaryPassword,
          returnSecureToken: true,
        }),
      });

      const restData = await restResponse.json();

      if (!restResponse.ok) {
        const errorMsg = restData?.error?.message || 'REST API signup failed';
        console.error(`[TenantAuth] REST API Auth Error: ${restResponse.status}`, restData);
        if (errorMsg.includes('EMAIL_EXISTS')) {
          throw new Error(`An account for mobile number ${mobile} already exists in Firebase Auth.`);
        }
        if (errorMsg.includes('WEAK_PASSWORD')) {
          throw new Error('Temporary password is too weak. Please use at least 6 characters.');
        }
        throw new Error(`Firebase Auth Creation Failed (${restResponse.status}): ${errorMsg}`);
      }

      tenantAuthUid = restData.localId;
      console.log(`[TenantAuth] Auth user created successfully. UID: ${tenantAuthUid}`);
    } catch (authErr: any) {
      console.error('[TenantAuth] Auth Account Creation Exception:', authErr);
      throw authErr;
    }

    // 2. Create Tenant user document in 'users' collection while Landlord remains 100% authenticated on db
    try {
      console.log(`[TenantAuth] Writing users/${tenantAuthUid} doc with ownerId: ${effectiveOwnerId}`);
      const userDocRef = doc(db, 'users', tenantAuthUid);
      const userProfileData = {
        uid: tenantAuthUid,
        role: 'tenant',
        name: tenantName.trim(),
        email,
        phone: mobile.trim(),
        mobileNumber: mobile.trim(),
        ownerId: effectiveOwnerId,
        tenantId,
        propertyId,
        unitId,
        isFirstLogin: true,
        loginPassword: temporaryPassword,
        authSecret: temporaryPassword,
        loginStatus: 'active' as TenantLoginStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userDocRef, userProfileData);
      console.log(`[TenantAuth] users/${tenantAuthUid} written successfully.`);
    } catch (usersDocErr: any) {
      console.error('[TenantAuth] Failed to write users doc:', {
        operation: 'setDoc',
        collection: 'users',
        targetUid: tenantAuthUid,
        landlordUid: currentLandlordUid,
        effectiveOwnerId,
        code: usersDocErr.code,
        message: usersDocErr.message,
      });
      throw new Error(`User profile write failed [users/${tenantAuthUid}]: ${usersDocErr.message}`);
    }

    // 3. Update the Tenant document with auth linkage
    try {
      console.log(`[TenantAuth] Updating tenants/${tenantId} with tenantAuthUid: ${tenantAuthUid}`);
      const tenantDocRef = doc(db, 'tenants', tenantId);
      await updateDoc(tenantDocRef, {
        tenantAuthUid,
        loginStatus: 'active' as TenantLoginStatus,
        isFirstLogin: true,
        loginPassword: temporaryPassword,
        authSecret: temporaryPassword,
        mobileNumber: mobile.trim(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`[TenantAuth] tenants/${tenantId} updated successfully.`);
    } catch (tenantDocErr: any) {
      console.error('[TenantAuth] Failed to update tenants doc:', {
        operation: 'updateDoc',
        collection: 'tenants',
        tenantId,
        landlordUid: currentLandlordUid,
        code: tenantDocErr.code,
        message: tenantDocErr.message,
      });
      throw new Error(`Tenant document linkage failed [tenants/${tenantId}]: ${tenantDocErr.message}`);
    }

    return { tenantAuthUid, email };
  },

  /**
   * Updates login status (e.g. active vs disabled) in both the tenant and user records.
   */
  async updateTenantLoginStatus(
    tenantId: string,
    status: TenantLoginStatus,
    tenantAuthUid?: string | null
  ): Promise<void> {
    const tenantDocRef = doc(db, 'tenants', tenantId);
    await updateDoc(tenantDocRef, {
      loginStatus: status,
      updatedAt: new Date().toISOString(),
    });

    if (tenantAuthUid) {
      try {
        const userDocRef = doc(db, 'users', tenantAuthUid);
        await updateDoc(userDocRef, {
          loginStatus: status,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Could not update user doc status for tenantAuthUid:', tenantAuthUid, e);
      }
    }
  },

  /**
   * Landlord changes a tenant's password directly.
   * Updates Firebase Authentication password first, then updates Firestore loginPassword & authSecret.
   */
  async changeTenantPassword(tenantId: string, newPassword: string, tenantAuthUid?: string, ownerId?: string): Promise<string> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const currentLandlordUid = primaryAuth?.currentUser?.uid;
    if (!currentLandlordUid) {
      throw new Error('Landlord authentication error: You must be logged in.');
    }

    // 1. Fetch tenant & user records
    const tenantDocRef = doc(db, 'tenants', tenantId);
    const tenantSnap = await getDoc(tenantDocRef);
    if (!tenantSnap.exists()) {
      throw new Error('Tenant record not found.');
    }
    const tenantData = tenantSnap.data();

    if (tenantData.ownerId && tenantData.ownerId !== currentLandlordUid) {
      throw new Error('Unauthorized: You can only change passwords for your own tenants.');
    }

    let userDocData: any = null;
    let effectiveAuthUid = tenantAuthUid || tenantData.tenantAuthUid;
    if (effectiveAuthUid) {
      const userDocRef = doc(db, 'users', effectiveAuthUid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        userDocData = userSnap.data();
      }
    }

    const rawMobile = tenantData.mobile || tenantData.mobileNumber || userDocData?.phone || userDocData?.mobileNumber;
    if (!rawMobile) {
      throw new Error('Tenant mobile number is missing.');
    }
    const cleanMobile = rawMobile.replace(/[^0-9]/g, '');
    const defaultEmail = formatTenantAuthEmail(rawMobile);
    let activeEmail = userDocData?.authEmail || tenantData.authEmail || defaultEmail;

    const apiKey = primaryApp.options.apiKey;
    if (!apiKey) {
      throw new Error('Firebase API key missing in config.');
    }

    // 2. Candidate secrets for re-authenticating existing user handle via REST API
    const candidateSecrets: string[] = [];
    if (userDocData?.loginPassword) candidateSecrets.push(userDocData.loginPassword);
    if (userDocData?.authSecret) candidateSecrets.push(userDocData.authSecret);
    if (tenantData?.loginPassword && !candidateSecrets.includes(tenantData.loginPassword)) candidateSecrets.push(tenantData.loginPassword);
    if (tenantData?.authSecret && !candidateSecrets.includes(tenantData.authSecret)) candidateSecrets.push(tenantData.authSecret);
    if (tenantData?.temporaryPassword && !candidateSecrets.includes(tenantData.temporaryPassword)) candidateSecrets.push(tenantData.temporaryPassword);

    const candidateEmails = [activeEmail, defaultEmail].filter((v, i, a) => v && a.indexOf(v) === i);
    let authUpdateSuccess = false;

    console.log(`[TenantAuth] Changing password for tenant: ${effectiveAuthUid} (${activeEmail})`);

    // 3. Re-authenticate existing user handle via REST API & update Auth password
    for (const emailHandle of candidateEmails) {
      if (authUpdateSuccess) break;
      for (const secret of candidateSecrets) {
        if (!secret) continue;
        try {
          const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailHandle, password: secret, returnSecureToken: true }),
          });
          const signInData = await signInRes.json();

          if (signInRes.ok && signInData.idToken) {
            const updateRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: signInData.idToken, password: newPassword, returnSecureToken: true }),
            });
            const updateData = await updateRes.json();
            if (updateRes.ok && updateData.localId) {
              authUpdateSuccess = true;
              effectiveAuthUid = updateData.localId;
              activeEmail = emailHandle;
              break;
            }
          }
        } catch (err) {
          console.error('[TenantAuth] REST API Auth Update Attempt Exception:', err);
        }
      }
    }

    // 4. Verify Firebase Auth password update succeeded before updating Firestore
    if (!authUpdateSuccess || !effectiveAuthUid) {
      console.error('[TenantAuth] Firebase Auth update FAILED. Password change aborted.');
      throw new Error('Unable to update the password in Firebase Authentication. Please try again.');
    }

    // 5. Update Firestore state ONLY AFTER Firebase Auth update confirmed
    const now = new Date().toISOString();
    await updateDoc(tenantDocRef, {
      tenantAuthUid: effectiveAuthUid,
      authEmail: activeEmail,
      loginPassword: newPassword,
      authSecret: newPassword,
      passwordResetRequested: false,
      updatedAt: now,
    });

    if (effectiveAuthUid) {
      const userDocRef = doc(db, 'users', effectiveAuthUid);
      await setDoc(userDocRef, {
        uid: effectiveAuthUid,
        role: 'tenant',
        name: (tenantData.name || userDocData?.name || 'Tenant').trim(),
        email: activeEmail,
        authEmail: activeEmail,
        phone: cleanMobile,
        mobileNumber: cleanMobile,
        ownerId: ownerId || currentLandlordUid,
        tenantId: tenantId,
        propertyId: tenantData.propertyId || userDocData?.propertyId || '',
        unitId: tenantData.unitId || userDocData?.unitId || '',
        loginPassword: newPassword,
        authSecret: newPassword,
        passwordResetRequested: false,
        loginStatus: tenantData.loginStatus || 'active',
        createdAt: userDocData?.createdAt || now,
        updatedAt: now,
      }, { merge: true });
    }

    console.log(`[TenantAuth] Password changed successfully for UID: ${effectiveAuthUid}. loginPassword updated.`);
    return newPassword;
  },
};

export default tenantAuthService;
