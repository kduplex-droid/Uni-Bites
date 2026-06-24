// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB25o3EAy8_kBzz8scx5WK3Rz__-ByY770",
  authDomain: "unibites-c4d7b.firebaseapp.com",
  projectId: "unibites-c4d7b",
  storageBucket: "unibites-c4d7b.firebasestorage.app",
  messagingSenderId: "696404567251",
  appId: "1:696404567251:web:c7cd4882c9c86c374da026"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication and export it for use in other files
export const auth = getAuth(app);
