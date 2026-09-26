import { 
  collection, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query,
  where,
} from 'firebase/firestore';
import { db as firestoreDb, auth as rawAuth } from '../firebase/config';
const auth = rawAuth as any;

const sanitizeData = (data: any): any => {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  if (typeof data === 'object') {
    const proto = Object.getPrototypeOf(data);
    if (proto !== null && proto !== Object.prototype) {
      return data;
    }
    const cleaned: any = {};
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeData(val);
      }
    }
    return cleaned;
  }
  return data;
};

const cache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export const db = {
  clearCache(colName?: string) {
    if (colName) {
      cache.delete(colName);
    } else {
      cache.clear();
    }
  },

  async getDocs<T>(colName: string, forceRefresh = false): Promise<T[]> {
    try {
      if (!forceRefresh && cache.has(colName)) {
        const cached = cache.get(colName)!;
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          return [...cached.data];
        }
      }

      const colRef = collection(firestoreDb, colName);
      let q = colRef as any;
      
      const user = auth.currentUser;
      const ownerFilteredCollections = ['properties', 'units', 'tenants', 'bills', 'payments'];
      if (user && ownerFilteredCollections.includes(colName)) {
        q = query(colRef, where('ownerId', '==', user.uid));
      }

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as any)
      } as any));

      cache.set(colName, { data, timestamp: Date.now() });
      return data;
    } catch (e) {
      console.error(`DB Error: getDocs for ${colName}`, e);
      return [];
    }
  },

  async getDoc<T>(colName: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(firestoreDb, colName, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...(docSnap.data() as any)
        } as any;
      }
      return null;
    } catch (e) {
      console.error(`DB Error: getDoc for ${colName}/${id}`, e);
      return null;
    }
  },

  async addDoc<T>(colName: string, data: any): Promise<T> {
    try {
      cache.delete(colName);
      const colRef = collection(firestoreDb, colName);
      const cleanData = { ...data };
      delete cleanData.id;
      
      const docData = {
        ...cleanData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const sanitizedData = sanitizeData(docData);

      const docRef = await addDoc(colRef, sanitizedData);
      return {
        id: docRef.id,
        ...sanitizedData
      } as any;
    } catch (e) {
      console.error(`DB Error: addDoc for ${colName}`, e);
      throw e;
    }
  },

  async setDoc<T>(colName: string, id: string, data: any): Promise<T> {
    try {
      cache.delete(colName);
      const docRef = doc(firestoreDb, colName, id);
      const cleanData = { ...data };
      delete cleanData.id;

      const docData = {
        ...cleanData,
        updatedAt: new Date().toISOString(),
      };

      const sanitizedData = sanitizeData(docData);

      await setDoc(docRef, sanitizedData, { merge: true });
      return {
        id,
        ...sanitizedData
      } as any;
    } catch (e) {
      console.error(`DB Error: setDoc for ${colName}/${id}`, e);
      throw e;
    }
  },

  async updateDoc<T>(colName: string, id: string, data: Partial<any>): Promise<T> {
    try {
      cache.delete(colName);
      const docRef = doc(firestoreDb, colName, id);
      const cleanData = { ...data };
      delete cleanData.id;

      const docData = {
        ...cleanData,
        updatedAt: new Date().toISOString(),
      };

      const sanitizedData = sanitizeData(docData);

      await updateDoc(docRef, sanitizedData);
      
      const updatedSnap = await getDoc(docRef);
      return {
        id,
        ...(updatedSnap.data() as any)
      } as any;
    } catch (e) {
      console.error(`DB Error: updateDoc for ${colName}/${id}`, e);
      throw e;
    }
  },

  async deleteDoc(colName: string, id: string): Promise<void> {
    try {
      cache.delete(colName);
      const docRef = doc(firestoreDb, colName, id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error(`DB Error: deleteDoc for ${colName}/${id}`, e);
      throw e;
    }
  },

  async queryDocs<T>(colName: string, filterFn: (doc: T) => boolean, forceRefresh = false): Promise<T[]> {
    const docs = await this.getDocs<T>(colName, forceRefresh);
    return docs.filter(filterFn);
  },
  
  async clearCollection(colName: string): Promise<void> {
    try {
      cache.delete(colName);
      const colRef = collection(firestoreDb, colName);
      const querySnapshot = await getDocs(colRef);
      const deletePromises = querySnapshot.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      console.error(`DB Error: clearCollection for ${colName}`, e);
    }
  }
};

export default db;
