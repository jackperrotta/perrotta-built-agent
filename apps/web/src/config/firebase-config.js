// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your web app's Firebase configuration
// TODO: Replace with your actual project keys
const firebaseConfig = {
    apiKey: "AIzaSyB7FfT3_PorxvpuYvNgDwjX7VxRAlNbKvI",
    authDomain: "perrotta-built-agent.firebaseapp.com",
    projectId: "perrotta-built-agent",
    storageBucket: "perrotta-built-agent.firebasestorage.app",
    messagingSenderId: "742404330700",
    appId: "1:742404330700:web:e9c4c3065a4a4d0c2b9e69"
};

// Initialize Firebase
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, auth, storage };
