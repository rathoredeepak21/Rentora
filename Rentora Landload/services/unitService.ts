import db from '../utils/db';
import { Unit, UnitStatus } from '../types';

const COLLECTION = 'units';

export const unitService = {
  async getUnitsByOwner(ownerId: string): Promise<Unit[]> {
    return db.queryDocs<Unit>(COLLECTION, (doc) => doc.ownerId === ownerId);
  },

  async getUnits(propertyId: string): Promise<Unit[]> {
    return db.queryDocs<Unit>(COLLECTION, (doc) => doc.propertyId === propertyId);
  },

  async getUnitById(id: string): Promise<Unit | null> {
    return db.getDoc<Unit>(COLLECTION, id);
  },

  async createUnit(unit: Omit<Unit, 'createdAt' | 'updatedAt'>): Promise<Unit> {
    return db.addDoc<Unit>(COLLECTION, unit);
  },

  async updateUnit(id: string, unit: Partial<Unit>): Promise<Unit> {
    return db.updateDoc<Unit>(COLLECTION, id, unit);
  },

  async deleteUnit(id: string): Promise<void> {
    await db.deleteDoc(COLLECTION, id);
  },

  async updateUnitStatus(id: string, status: UnitStatus, currentTenantId: string | null): Promise<Unit> {
    return db.updateDoc<Unit>(COLLECTION, id, {
      status,
      currentTenantId,
    });
  }
};
export default unitService;
