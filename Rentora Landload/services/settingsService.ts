import db from '../utils/db';
import { BillSettings } from '../types';

const COLLECTION = 'settings';

export const settingsService = {
  async getSettings(ownerId: string): Promise<BillSettings | null> {
    const settings = await db.getDoc<BillSettings>(COLLECTION, ownerId);
    if (!settings) {
      // Return default empty template
      return {
        id: ownerId,
        ownerName: '',
        businessName: '',
        phone: '',
        address: '',
        upiId: '',
        paymentInstructions: 'Please pay by the due date to avoid late fees. Kindly send a payment screenshot for verification.',
        extraStayPolicy: 'fixed30',
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      ...settings,
      extraStayPolicy: settings.extraStayPolicy || 'fixed30',
    };
  },

  async saveSettings(ownerId: string, settings: Omit<BillSettings, 'id' | 'updatedAt'>): Promise<BillSettings> {
    const data: BillSettings = {
      ...settings,
      id: ownerId,
      updatedAt: new Date().toISOString(),
    };
    return db.setDoc<BillSettings>(COLLECTION, ownerId, data);
  }
};
export default settingsService;
