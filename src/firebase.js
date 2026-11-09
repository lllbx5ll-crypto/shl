import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// إعدادات تطبيق الويب من مشروع Firebase: zyqmora-ai.
// هذه إعدادات عميل عامة وليست كلمة مرور أو مفتاح Service Account.
// حماية البيانات تعتمد على قواعد Firestore وتقييد مفاتيح Google Cloud.
const firebaseConfig = {
  apiKey: "AIzaSyCblc3nWr1PavqqxXrC0NzyQZPjSv48Tok",
  authDomain: "zyqmora-ai.firebaseapp.com",
  projectId: "zyqmora-ai",
  storageBucket: "zyqmora-ai.firebasestorage.app",
  messagingSenderId: "457355655353",
  appId: "1:457355655353:web:c9f9932e7a5cc5e073c368",
  measurementId: "G-PKJ0EHVFY2"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

export default app;
