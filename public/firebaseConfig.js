// Firebase Web SDK Configuration & Authentication Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCOOazIW4gG3YaaTvJezcV73Acu1ekyjEg",
  authDomain: "teacher-ai-ab79f.firebaseapp.com",
  projectId: "teacher-ai-ab79f",
  storageBucket: "teacher-ai-ab79f.firebasestorage.app",
  messagingSenderId: "689389776404",
  appId: "1:689389776404:web:2125c28d0ea68c3bde4101",
  measurementId: "G-YT6Q1B7R6K"
};

// Allowed admin emails for /admin/users dashboard
const ADMIN_EMAILS = [
  "warikhan1995@gmail.com"
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  ADMIN_EMAILS
};
