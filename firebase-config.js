// Configurazione Firebase.
// 1) Crea un progetto Firebase con piano Spark gratuito.
// 2) Project settings > General > Your apps > Web app.
// 3) Copia qui il blocco firebaseConfig.
// 4) Inserisci in adminEmails l'email dell'account admin creato in Firebase Authentication.

export const firebaseConfig = {
  apiKey: "INSERISCI_API_KEY",
  authDomain: "INSERISCI_PROJECT_ID.firebaseapp.com",
  projectId: "INSERISCI_PROJECT_ID",
  storageBucket: "INSERISCI_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "INSERISCI_MESSAGING_SENDER_ID",
  appId: "INSERISCI_APP_ID"
};

export const firebaseOptions = {
  adminEmails: ["email-admin@example.com"]
};
