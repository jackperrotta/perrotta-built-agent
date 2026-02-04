
import { db } from '../config/firebase.js';

/**
 * Interface definition for a user document in Firestore.
 */
export interface UserData {
  role?: string;
  email?: string;
  [key: string]: any;
}

/**
 * Fetches the user role from Firestore.
 * Defaults to 'user' if no role is found.
 * 
 * @param uid The user's UID
 * @returns The role string
 */
export const getUserRole = async (uid: string): Promise<string> => {
  try {
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      // If user doesn't exist, we might want to create a default record
      // or just return a default role.
      return 'user';
    }

    const userData = userDoc.data() as UserData;
    return userData.role || 'user';
  } catch (error) {
    console.error(`Error fetching user role for UID ${uid}:`, error);
    // Fail safe to basic user
    return 'user';
  }
};
