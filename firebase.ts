import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB_C4d7qU9FqY6Z2g_XEw3uKDx80BcVlHM",
  authDomain: "wepe-91da3.firebaseapp.com",
  projectId: "wepe-91da3",
  storageBucket: "wepe-91da3.firebasestorage.app",
  messagingSenderId: "246553353567",
  appId: "1:246553353567:web:4d5ec731d937a35283eaea"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
