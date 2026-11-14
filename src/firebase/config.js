import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBK-70PK5dnITmqWp1P1GEchQrhV2JOZBo",
  authDomain: "tgi-service-ascenseur.firebaseapp.com",
  projectId: "tgi-service-ascenseur",
  storageBucket: "tgi-service-ascenseur.firebasestorage.app",
  messagingSenderId: "572935217441",
  appId: "1:572935217441:web:bc7decb293e8e7ed4fde60"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
