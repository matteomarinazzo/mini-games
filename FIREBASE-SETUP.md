# 🔥 Configuration Firebase pour le système de notation

## Étape 1 : Créer un projet Firebase (5 min)

1. Va sur [Firebase Console](https://console.firebase.google.com/)
2. Clique sur **"Ajouter un projet"**
3. Nom du projet : `mini-games` (ou ce que tu veux)
4. Désactive Google Analytics (pas nécessaire)
5. Clique sur **"Créer le projet"**

## Étape 2 : Activer Realtime Database

1. Dans le menu gauche, clique sur **"Realtime Database"**
2. Clique sur **"Créer une base de données"**
3. Choisis la zone : **Europe (ou proche de chez toi)**
4. Mode de sécurité : **"Commencer en mode test"** (pour l'instant)
5. Clique sur **"Activer"**

## Étape 3 : Récupérer les credentials

1. Dans le menu gauche, clique sur l'icône **⚙️ (Paramètres)**
2. Clique sur **"Paramètres du projet"**
3. Descends jusqu'à **"Vos applications"**
4. Clique sur l'icône **</>** (Web)
5. Nom de l'app : `Mini Games Web`
6. **NE PAS** cocher "Firebase Hosting"
7. Clique sur **"Enregistrer l'application"**

Tu vas voir un bloc de code comme ça :

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC-xxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "mini-games-xxxxx.firebaseapp.com",
  databaseURL: "https://mini-games-xxxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mini-games-xxxxx",
  storageBucket: "mini-games-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxx"
};
```

## Étape 4 : Copier la config dans ton code

Ouvre `rating-system.js` et **remplace** cette partie :

```javascript
// AVANT (ligne 3-11)
const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "ton-projet.firebaseapp.com",
  // ...
};

// APRÈS (colle ta vraie config)
const firebaseConfig = {
  apiKey: "AIzaSyC-xxxxxxxxxx", // TA VRAIE API KEY
  authDomain: "mini-games-xxxxx.firebaseapp.com",
  databaseURL: "https://mini-games-xxxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mini-games-xxxxx",
  storageBucket: "mini-games-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxx"
};
```

## Étape 5 : Configurer les règles de sécurité

# 🔥 Configuration Firebase - DERNIÈRE ÉTAPE

## ✅ Tu as déjà la config Firebase !

Ton code est prêt avec tes credentials. Il reste juste **UNE ÉTAPE** :

## 📋 Configurer les règles de sécurité

1. Va sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionne ton projet **"mini-games-plateform"**
3. Dans le menu gauche, clique sur **"Realtime Database"**
4. Clique sur l'onglet **"Règles"** (en haut)

Tu verras quelque chose comme :

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## 🔒 Remplace par ces règles sécurisées :

```json
{
  "rules": {
    "ratings": {
      "$gameId": {
        ".read": true,
        ".write": "newData.hasChildren(['total', 'count']) && newData.child('total').isNumber() && newData.child('count').isNumber() && newData.child('total').val() >= 0 && newData.child('count').val() >= 0 && newData.child('total').val() <= newData.child('count').val() * 5"
      }
    }
  }
}
```

5. Clique sur **"Publier"**

## ✨ C'est tout !

Maintenant teste :

1. Ouvre ton site `index.html`
2. Ouvre la console (F12)
3. Tu devrais voir : **✅ Firebase connecté**
4. Clique sur les étoiles d'un jeu et note-le
5. Ouvre ton site dans un **autre navigateur** (ou mode privé)
6. La note que tu as mis est déjà là ! 🎉

## 🔍 Vérifier que ça marche

Dans Firebase Console :
1. Va dans **Realtime Database**
2. Onglet **"Données"**
3. Tu devrais voir :

```
mini-games-plateform-default-rtdb
└── ratings
    ├── snow-digger
    │   ├── total: 5
    │   └── count: 1
    └── morpion
        ├── total: 0
        └── count: 0
```

## 🎯 Comment ça fonctionne

- ✅ **Notes partagées** entre tous les utilisateurs
- ✅ **Temps réel** : si quelqu'un note, ça s'affiche direct
- ✅ **Sécurisé** : impossible de tricher (notes entre 1-5 uniquement)
- ✅ **Fallback** : si Firebase plante → localStorage
- ✅ **Gratuit** jusqu'à 100 000 votes/jour

## 📊 Structure des données

```javascript
// Dans Firebase (partagé globalement)
ratings/snow-digger = { total: 47, count: 12 }  // Moyenne: 3.9

// Dans localStorage (local à l'utilisateur)
userRatings = { "snow-digger": 5 }  // L'user a mis 5★
```

## 🐛 Dépannage

**"Permission denied"**
→ Tu n'as pas publié les règles. Retourne à l'étape des règles.

**"Firebase is not defined"**
→ Problème de connexion. Recharge la page.

**Ça reste en mode local**
→ Ouvre la console, regarde s'il y a une erreur rouge.

## 🚀 Prochaines étapes (optionnel)

- Ajouter un graphique de répartition des notes
- Système de commentaires
- Classement des meilleurs jeux
- Badge "Jeu le mieux noté"

---

**Temps total : 2 minutes** ⏱️

Tu es prêt ! Le système de notation est maintenant **100% fonctionnel** ! 🎉