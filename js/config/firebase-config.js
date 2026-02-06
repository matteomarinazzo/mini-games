// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxrG6G0Lkx2NdE6nDivnJAf2ypyB3CBjc",
  authDomain: "mini-games-plateform.firebaseapp.com",
  databaseURL: "https://mini-games-plateform-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mini-games-plateform",
  storageBucket: "mini-games-plateform.firebasestorage.app",
  messagingSenderId: "1067265936234",
  appId: "1:1067265936234:web:147fed257ea5c9409df313",
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { app, database };