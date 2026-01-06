
import { InvoiceData, BankStatementData, LogEntry, ProcessedFile } from '../types';

const DB_NAME = 'AutoTallyDB';
const DB_VERSION = 2;

export interface InvoiceRegistryEntry {
  invoiceNumber: string;
  source: string; // 'OCR' | 'EXCEL'
  timestamp: number;
}

class AutoTallyDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('uploads')) {
          db.createObjectStore('uploads', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('logs')) {
          db.createObjectStore('logs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('invoice_numbers')) {
          db.createObjectStore('invoice_numbers', { keyPath: 'invoiceNumber' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async saveUpload(upload: ProcessedFile) {
    const db = await this.init();
    const tx = db.transaction('uploads', 'readwrite');
    const store = tx.objectStore('uploads');
    // Remove the File object before saving to IDB as it can be large/problematic
    const { file, ...serializable } = upload;
    await store.put(serializable);
  }

  async getAllUploads(): Promise<ProcessedFile[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('uploads', 'readonly');
      const store = tx.objectStore('uploads');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveLog(log: LogEntry) {
    const db = await this.init();
    const tx = db.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');
    await store.put(log);
  }

  async getAllLogs(): Promise<LogEntry[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('logs', 'readonly');
      const store = tx.objectStore('logs');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.sort((a: any, b: any) => b.timestamp - a.timestamp));
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    const db = await this.init();
    const tx = db.transaction(['uploads', 'logs'], 'readwrite');
    tx.objectStore('uploads').clear();
    tx.objectStore('logs').clear();
  }

  async deleteUpload(id: string) {
    const db = await this.init();
    const tx = db.transaction('uploads', 'readwrite');
    const store = tx.objectStore('uploads');
    await store.delete(id);
  }

  async saveInvoiceEntry(entry: InvoiceRegistryEntry) {
    const db = await this.init();
    const tx = db.transaction('invoice_numbers', 'readwrite');
    const store = tx.objectStore('invoice_numbers');
    await store.put(entry);
  }

  async getAllInvoiceEntries(): Promise<InvoiceRegistryEntry[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('invoice_numbers', 'readonly');
      const store = tx.objectStore('invoice_numbers');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async checkInvoiceExists(invoiceNumber: string): Promise<boolean> {
    const db = await this.init();
    const tx = db.transaction('invoice_numbers', 'readonly');
    const store = tx.objectStore('invoice_numbers');

    return new Promise((resolve, reject) => {
      const request = store.get(invoiceNumber);
      request.onsuccess = () => {
        resolve(!!request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }
  async clearInvoiceEntries() {
    const db = await this.init();
    const tx = db.transaction('invoice_numbers', 'readwrite');
    tx.objectStore('invoice_numbers').clear();
  }
}

const dbInstance = new AutoTallyDB();

export const saveLogToDB = async (log: LogEntry) => {
  await dbInstance.saveLog(log);
};

export const getAllLogsFromDB = async () => {
  return await dbInstance.getAllLogs();
};

export const saveInvoiceToDB = async (data: InvoiceData, status: string, id: string) => {
  // Find the upload and update it
  const uploads = await dbInstance.getAllUploads();
  const upload = uploads.find(u => u.id === id);
  if (upload) {
    upload.status = status as any;
    upload.data = data;
    await dbInstance.saveUpload(upload);
  }
};

export const saveUploadToDB = async (upload: ProcessedFile) => {
  await dbInstance.saveUpload(upload);
};

export const getUploadsFromDB = async () => {
  return await dbInstance.getAllUploads();
};

export const deleteUploadFromDB = async (id: string) => {
  await dbInstance.deleteUpload(id);
};


export const clearLocalDatabase = async () => {
  await dbInstance.clearAll();
};

export const saveInvoiceRegistry = async (invoiceNumber: string, source: string) => {
  if (!invoiceNumber) return;
  await dbInstance.saveInvoiceEntry({
    invoiceNumber: invoiceNumber.trim(),
    source,
    timestamp: Date.now()
  });
};

export const getInvoiceRegistry = async () => {
  return await dbInstance.getAllInvoiceEntries();
};


export const checkInvoiceExists = async (invoiceNumber: string) => {
  return await dbInstance.checkInvoiceExists(invoiceNumber);
};

export const clearInvoiceRegistry = async () => {
  await dbInstance.clearInvoiceEntries();
};
