import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Firebase Console'dan (https://console.firebase.google.com) alınan proje config'i.
// Project Settings → Your apps → Web app → Config kısmından kopyalayın.
// Realtime Database bölümünü aktifleştirmeyi unutmayın (Spark planı ücretsiz).
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? 'YOUR_API_KEY',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? 'YOUR_PROJECT.firebaseapp.com',
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL       ?? 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? 'YOUR_PROJECT_ID',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? 'YOUR_PROJECT.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? 'YOUR_SENDER_ID',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? 'YOUR_APP_ID',
};

export const app = initializeApp(firebaseConfig);
export const db  = getDatabase(app);
