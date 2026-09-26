import db from '../utils/db';
import { Property } from '../types';

const COLLECTION = 'properties';

export const propertyService = {
  async getProperties(ownerId: string): Promise<Property[]> {
    return db.queryDocs<Property>(COLLECTION, (doc) => doc.ownerId === ownerId && !doc.isDeleted);
  },

  async getPropertyById(id: string): Promise<Property | null> {
    const property = await db.getDoc<Property>(COLLECTION, id);
    return property && !property.isDeleted ? property : null;
  },

  async createProperty(property: Omit<Property, 'createdAt' | 'updatedAt'>): Promise<Property> {
    const data = {
      ...property,
      isDeleted: false,
    };
    return db.addDoc<Property>(COLLECTION, data);
  },

  async updateProperty(id: string, property: Partial<Property>): Promise<Property> {
    return db.updateDoc<Property>(COLLECTION, id, property);
  },

  async deleteProperty(id: string): Promise<void> {
    // Soft delete to protect financial/tenant history
    await db.updateDoc<Property>(COLLECTION, id, { isDeleted: true });
  },

  async searchProperties(ownerId: string, query: string): Promise<Property[]> {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return this.getProperties(ownerId);
    }
    return db.queryDocs<Property>(COLLECTION, (doc) => {
      return (
        doc.ownerId === ownerId &&
        !doc.isDeleted &&
        (doc.name.toLowerCase().includes(normalizedQuery) ||
          doc.address.toLowerCase().includes(normalizedQuery))
      );
    });
  }
};
export default propertyService;
