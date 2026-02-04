import { auth } from './config/firebase-config.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/**
 * Log in with email and password
 * @param {string} email 
 * @param {string} password 
 */
export async function login(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
}

/**
 * Log out the current user
 */
export async function logout() {
    try {
        await signOut(auth);
        window.location.href = '/admin/login.html';
    } catch (error) {
        console.error("Logout Error:", error);
        throw error;
    }
}

/**
 * Get the current user's ID token.
 * useful for API requests.
 */
export async function getToken() {
    const user = auth.currentUser;
    if (user) {
        return await user.getIdToken();
    }
    return null;
}

/**
 * Initialize auth state listener.
 * @param {Function} callback - Called with user object when state changes
 */
export function onAuthChange(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}
