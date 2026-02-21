// firebase-config.js
import { checkRealConnection } from "../network.js";
let app = null;
let database = null;
let dbFunctions = { ref: null, onValue: null, get: null, set: null, goOffline: null, goOnline: null, runTransaction: null };
let auth = null;

// Signal pour savoir quand Firebase est prêt
let resolveReady;
export const firebaseReady = new Promise(resolve => { resolveReady = resolve; });

async function initFirebase() {
  // DOUBLE VÉRIFICATION : Navigateur + Test Réseau Réel
  const isReallyOnline = await checkRealConnection();

  if (!isReallyOnline) {
    console.log("📡 Mode Hors-ligne réel détecté. Firebase bloqué pour éviter le spam.");
    return;
  }

  try {
    const fbApp = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const fbDb = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js");
    const fbAuth = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
    /*
    // PROD
    const firebaseConfig = {
      apiKey: "AIzaSyBatdWjY9IrFlYm9wAiAsAXqGkhxwCu5NI",
      authDomain: "mini-games-plateform-prod.firebaseapp.com",
      databaseURL: "https://mini-games-plateform-prod-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "mini-games-plateform-prod",
      storageBucket: "mini-games-plateform-prod.firebasestorage.app",
      messagingSenderId: "258352713120",
      appId: "1:258352713120:web:5bcf389180ee44fb1ca8c5"
    };
    */

    // DEV
    const firebaseConfig = {
      apiKey: "AIzaSyAxrG6G0Lkx2NdE6nDivnJAf2ypyB3CBjc",
      authDomain: "mini-games-plateform.firebaseapp.com",
      databaseURL: "https://mini-games-plateform-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "mini-games-plateform",
      storageBucket: "mini-games-plateform.firebasestorage.app",
      messagingSenderId: "1067265936234",
      appId: "1:1067265936234:web:147fed257ea5c9409df313",
      runTransaction: fbDb.runTransaction,
    };

    app = fbApp.initializeApp(firebaseConfig);
    database = fbDb.getDatabase(app);
    auth = fbAuth.getAuth(app);

    // CONNEXION ANONYME AUTOMATIQUE
    await fbAuth.signInAnonymously(auth);
    console.log("👤 Connecté anonymement (UID:", auth.currentUser.uid, ")");

    // Sécurité supplémentaire : on force le mode offline si le ping échoue juste après l'init
    const stillOnline = await checkRealConnection();
    if (!stillOnline) {
      fbDb.goOffline(database);
      return;
    }

    // Remplissage des fonctions
    dbFunctions.ref = fbDb.ref;
    dbFunctions.onValue = fbDb.onValue;
    dbFunctions.get = fbDb.get;
    dbFunctions.set = fbDb.set;
    dbFunctions.goOffline = fbDb.goOffline;
    dbFunctions.goOnline = fbDb.goOnline;
    dbFunctions.runTransaction = fbDb.runTransaction;
    dbFunctions.update = fbDb.update;

    console.log("🔥 Firebase chargé et prêt.");
    resolveReady(true);
  } catch (e) {
    console.warn("❌ Erreur de chargement Firebase", e);
    resolveReady(false);
  }
}


// Initialisation en arrière-plan (non bloquant pour permettre au reste du site de charger)
initFirebase();

// Gestion automatique de la connexion
window.addEventListener('offline', () => { if (database) dbFunctions.goOffline(database); });
window.addEventListener('online', () => { if (database) dbFunctions.goOnline(database); else initFirebase(); });

// On exporte tout d'ici !
export { app, database, auth };
export const getRef = () => dbFunctions.ref;
export const getGet = () => dbFunctions.get;
export const getSet = () => dbFunctions.set;
export const getRunTransaction = () => dbFunctions.runTransaction;
export const getOnValue = () => dbFunctions.onValue;
export const getUpdate = () => dbFunctions.update;
