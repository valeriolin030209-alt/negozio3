// Configurazione Firebase.
// 1) Crea un progetto Firebase con piano Spark gratuito.
// 2) Project settings > General > Your apps > Web app.
// 3) Copia qui il blocco firebaseConfig.
// 4) Inserisci in adminEmails l'email dell'account admin creato in Firebase Authentication.

export const firebaseConfig = {

  apiKey: "AIzaSyD6S3V3y5Tt-zXX8FKASmffLnctqXp2vSE",

  authDomain: "negozio-d5c75.firebaseapp.com",

  projectId: "negozio-d5c75",

  storageBucket: "negozio-d5c75.firebasestorage.app",

  messagingSenderId: "972727940645",

  appId: "1:972727940645:web:19d17f6334a9949ccbf1cc",

  measurementId: "G-Z7L2NQX445"

};

export const firebaseOptions = {
  adminEmails: ["valeriolin030209@gmail.com"]
};
