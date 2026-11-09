import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, GoogleAuthProvider, getAuth } from "firebase/auth";
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

// Initialize persistence before the user taps the Google button. This avoids
// awaiting storage setup inside the click handler, which can lose Android's
// transient user gesture and cause the Google popup to be blocked.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    // Required for signInWithPopup/signInWithRedirect when using initializeAuth.
    // Without this resolver, Firebase can throw auth/argument-error.
    popupRedirectResolver: browserPopupRedirectResolver
  });
} catch (error) {
  if (error?.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    throw error;
  }
}
export { auth };
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

export default app;
