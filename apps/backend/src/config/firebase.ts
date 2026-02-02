import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import { MockFirestore, MockStorage, MockAuth } from './mockFirebase.js';

dotenv.config();

const isMock = process.env.MOCK_FIREBASE === 'true';

let db: any;
let storage: any;
let auth: any;

if (isMock) {
    console.warn('USING MOCK FIREBASE IMPLEMENTATION');
    db = new MockFirestore();
    storage = new MockStorage();
    auth = new MockAuth();
} else {
    // Check if app is already initialized to avoid hot-reload errors
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'perrotta-built-agent.firebasestorage.app'
        });
    }

    db = admin.firestore();
    storage = admin.storage();
    auth = admin.auth();
}

export { db, storage, auth };
