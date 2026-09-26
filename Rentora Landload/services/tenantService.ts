import db from '../utils/db';
import { Tenant, TenantStatus, Bill, Payment } from '../types';
import { unitService } from './unitService';
import { tenantAuthService } from './tenantAuthService';

const COLLECTION = 'tenants';

export interface CreateTenantOptions {
  createLogin?: boolean;
  temporaryPassword?: string;
}

export const tenantService = {
  async getTenants(ownerId: string): Promise<Tenant[]> {
    return db.queryDocs<Tenant>(COLLECTION, (doc) => doc.ownerId === ownerId);
  },

  async getTenantById(id: string): Promise<Tenant | null> {
    return db.getDoc<Tenant>(COLLECTION, id);
  },

  async createTenant(
    tenant: Omit<Tenant, 'status' | 'createdAt' | 'updatedAt'>,
    options?: CreateTenantOptions
  ): Promise<Tenant> {
    // 1. Double check unit occupancy status
    const unit = await unitService.getUnitById(tenant.unitId);
    if (!unit) {
      throw new Error('Selected Unit does not exist');
    }
    if (unit.status === 'occupied') {
      throw new Error('This unit is already occupied by another tenant');
    }

    // 2. Create the tenant record
    const data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'> = {
      ...tenant,
      mobileNumber: tenant.mobileNumber || tenant.mobile,
      status: 'active',
      loginStatus: options?.createLogin ? 'active' : (tenant.loginStatus || 'not_created'),
    };
    const newTenant = await db.addDoc<Tenant>(COLLECTION, data);

    // 3. Update the unit status
    await unitService.updateUnitStatus(tenant.unitId, 'occupied', newTenant.id!);

    // 4. Create Tenant Firebase Auth login if requested
    if (options?.createLogin && options?.temporaryPassword) {
      try {
        const authRes = await tenantAuthService.createTenantAuthAccount({
          tenantId: newTenant.id!,
          mobile: tenant.mobile,
          temporaryPassword: options.temporaryPassword,
          ownerId: tenant.ownerId,
          propertyId: tenant.propertyId,
          unitId: tenant.unitId,
          tenantName: tenant.name,
        });
        newTenant.tenantAuthUid = authRes.tenantAuthUid;
        newTenant.loginStatus = 'active';
        newTenant.isFirstLogin = true;
      } catch (authError: any) {
        console.error('Tenant App login creation failed, performing rollback:', authError);
        // Rollback created tenant doc and unit occupancy to prevent broken state
        try {
          if (newTenant.id) {
            await db.deleteDoc(COLLECTION, newTenant.id);
          }
          await unitService.updateUnitStatus(tenant.unitId, 'vacant', null);
        } catch (rollbackError) {
          console.error('Rollback error after failed tenant auth creation:', rollbackError);
        }
        throw new Error(`Tenant Login Creation Failed: ${authError.message}. Process rolled back safely.`);
      }
    }

    return newTenant;
  },

  async updateTenant(id: string, tenant: Partial<Tenant>): Promise<Tenant> {
    const existingTenant = await db.getDoc<Tenant>(COLLECTION, id);
    if (!existingTenant) {
      throw new Error('Tenant not found');
    }

    const propertyChanged = tenant.propertyId && tenant.propertyId !== existingTenant.propertyId;
    const unitChanged = tenant.unitId && tenant.unitId !== existingTenant.unitId;

    if (propertyChanged || unitChanged) {
      const newUnitId = tenant.unitId || existingTenant.unitId;
      const newUnit = await unitService.getUnitById(newUnitId);
      if (!newUnit) {
        throw new Error('Target unit does not exist');
      }
      if (newUnit.status === 'occupied' && newUnit.currentTenantId !== id) {
        throw new Error('Target unit is already occupied by another tenant');
      }

      // 1. Reset old unit
      await unitService.updateUnitStatus(existingTenant.unitId, 'vacant', null);

      // 2. Occupy new unit
      await unitService.updateUnitStatus(newUnitId, 'occupied', id);
    }

    // Keep mobileNumber in sync with mobile
    const updates: Partial<Tenant> = { ...tenant };
    if (updates.mobile && !updates.mobileNumber) {
      updates.mobileNumber = updates.mobile;
    }

    return db.updateDoc<Tenant>(COLLECTION, id, updates);
  },

  async vacateTenant(id: string, moveOutDate: string): Promise<Tenant> {
    const tenant = await db.getDoc<Tenant>(COLLECTION, id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    if (tenant.status === 'vacated') {
      throw new Error('Tenant is already vacated');
    }

    // 1. Revoke/disable tenant app access on vacate
    if (tenant.tenantAuthUid) {
      await tenantAuthService.updateTenantLoginStatus(id, 'disabled', tenant.tenantAuthUid);
    }

    // 2. Update tenant status and move-out date
    const updatedTenant = await db.updateDoc<Tenant>(COLLECTION, id, {
      status: 'vacated',
      loginStatus: 'disabled',
      moveOutDate,
    });

    // 3. Update unit status to vacant
    await unitService.updateUnitStatus(tenant.unitId, 'vacant', null);

    return updatedTenant;
  },

  async searchTenants(ownerId: string, query: string, status?: TenantStatus): Promise<Tenant[]> {
    const normalizedQuery = query.toLowerCase().trim();
    const allTenants = await db.queryDocs<Tenant>(COLLECTION, (doc) => {
      const matchOwner = doc.ownerId === ownerId;
      const matchStatus = status ? doc.status === status : true;
      return matchOwner && matchStatus;
    });

    if (!normalizedQuery) {
      return allTenants;
    }

    return allTenants.filter((doc) => {
      return (
        doc.name.toLowerCase().includes(normalizedQuery) ||
        doc.mobile.includes(normalizedQuery)
      );
    });
  },

  async deleteTenant(id: string): Promise<void> {
    const tenant = await db.getDoc<Tenant>(COLLECTION, id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // 1. Revoke / disable Tenant App access
    if (tenant.tenantAuthUid) {
      await tenantAuthService.updateTenantLoginStatus(id, 'disabled', tenant.tenantAuthUid);
    }

    // 2. Mark the assigned unit as vacant so new tenants can occupy it
    await unitService.updateUnitStatus(tenant.unitId, 'vacant', null);

    // 3. IMPORTANT: Historical bills and payments are PRESERVED for accounting and reports.
    // They are NOT deleted.

    // 4. Remove the active tenant profile document
    await db.deleteDoc(COLLECTION, id);
  }
};
export default tenantService;

