# ShoppingUno / Casa Market - catalogo clienti + area admin online

Questa versione risolve il problema delle modifiche che rimanevano salvate solo nel telefono/computer dell'admin.

Il sito ora puo funzionare in due modi:

1. **Modalita Firebase consigliata**: prodotti, categorie, impostazioni e ordini sono salvati online. Quando l'admin modifica qualcosa, i clienti vedono gli aggiornamenti aprendo lo stesso QR code.
2. **Modalita locale di emergenza**: se Firebase non e configurato, il sito funziona ancora, ma le modifiche restano solo nel browser usato.

## File principali

- `index.html`: pagina clienti da collegare al QR code.
- `admin.html`: pagina admin separata.
- `app.js`: logica del sito.
- `styles.css`: grafica responsive per telefono.
- `firebase-config.js`: file dove inserire la configurazione Firebase.
- `firestore.rules.txt`: regole di sicurezza da copiare in Firebase Firestore.

## Accesso admin

Codice admin:

```text
Linsofia2011
```

Con Firebase attivo, oltre al codice devi usare anche email e password dell'admin create dentro Firebase Authentication.

## Funzioni clienti

- Catalogo pensato per telefono.
- Icona categorie in alto a sinistra.
- Pannello categorie laterale.
- Ordini/carrello in alto a destra.
- Prodotti a 2 colonne su telefono.
- Ricerca prodotti.
- Ordinamento per categoria, nome, prezzo crescente e prezzo decrescente.
- Finestra dettaglio prodotto cliccando sulla scheda.
- Varianti prodotto: colore, misura, grandezza, versione, prezzo specifico.
- Prodotti in offerta con prezzo vecchio, prezzo scontato, percentuale e risparmio.
- Categoria automatica evidenziata: `Offerte e sconti`.
- Checkout con nome, telefono, destinazione, indirizzo se serve, pagamento e note.
- Destinazioni disponibili:
  - Casa / ufficio
  - Mercato martedi
  - Mercato mercoledi
  - Mercato giovedi
- Se la destinazione e `Casa / ufficio`, l'indirizzo e obbligatorio.
- Spesa minima diversa per ogni destinazione, modificabile dall'admin.

## Funzioni admin

- Modifica nome negozio e sottotitolo.
- Modifica messaggio in alto.
- Modifica casella informativa sopra il catalogo.
- Modifica spesa minima generale.
- Modifica spesa minima per ogni destinazione.
- Aggiunta, rinomina, eliminazione e riordino categorie.
- Aggiunta, modifica, eliminazione, nascondi/mostra e riordino prodotti.
- Caricamento foto prodotto.
- Gestione varianti prodotto.
- Gestione offerte.
- Gestione ordini e stato ordine.
- Generatore QR code.
- Pulsante `Carica dati attuali su Firebase` per inizializzare il database.

# Setup Firebase gratuito

## 1. Crea progetto Firebase

1. Vai su Firebase Console.
2. Crea un nuovo progetto.
3. Usa il piano **Spark gratuito**.
4. Non serve inserire carta per il piano Spark.

## 2. Attiva Authentication

1. Vai su **Build > Authentication**.
2. Clicca **Get started**.
3. Vai su **Sign-in method**.
4. Attiva **Email/Password**.
5. Attiva anche **Anonymous**.

## 3. Crea utente admin

1. Vai su **Authentication > Users**.
2. Clicca **Add user**.
3. Inserisci email e password dell'admin.
4. Dopo averlo creato, copia il suo **UID**.

Questo UID serve nelle regole Firestore.

## 4. Crea Firestore Database

1. Vai su **Build > Firestore Database**.
2. Clicca **Create database**.
3. Scegli **Production mode**.
4. Scegli una regione europea, per esempio `europe-west` se disponibile.
5. Crea il database.

## 5. Inserisci le regole di sicurezza

1. Apri il file `firestore.rules.txt`.
2. Sostituisci:

```text
INSERISCI_UID_ADMIN_QUI
```

con l'UID dell'utente admin creato prima.

3. Copia tutto il contenuto del file.
4. Vai in Firebase su **Firestore Database > Rules**.
5. Incolla le regole.
6. Clicca **Publish**.

## 6. Inserisci configurazione Firebase nel sito

1. Vai in Firebase su **Project settings**.
2. In basso, nella sezione **Your apps**, aggiungi una Web App se non esiste.
3. Firebase ti dara un blocco tipo:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

4. Apri il file `firebase-config.js`.
5. Sostituisci i valori `INSERISCI_...` con quelli di Firebase.
6. In `adminEmails`, inserisci l'email dell'admin.

Esempio:

```js
export const firebaseOptions = {
  adminEmails: ["tuopadre@email.com"]
};
```

## 7. Carica i file su GitHub

Carica nel repository GitHub questi file estratti, non lo ZIP:

```text
index.html
admin.html
app.js
styles.css
firebase-config.js
firestore.rules.txt
README.md
manifest.webmanifest
icon.svg
generate_qr.py
```

Poi fai **Commit changes**.

## 8. Primo avvio admin

1. Apri:

```text
https://TUO-LINK.github.io/negozio2/admin.html
```

2. Clicca **Accedi area admin**.
3. Inserisci codice:

```text
Linsofia2011
```

4. Inserisci email/password Firebase dell'admin.
5. Entra.
6. Vai su **Negozio**.
7. Clicca **Carica dati attuali su Firebase**.

Da quel momento, i clienti che aprono il QR vedranno i dati salvati online.

## Link QR code

Il QR code deve puntare sempre alla pagina clienti:

```text
https://TUO-LINK.github.io/negozio2/
```

Non deve puntare a:

```text
https://TUO-LINK.github.io/negozio2/admin.html
```

## Per aggiornare il sito senza cambiare QR

Carica i nuovi file nello stesso repository GitHub e mantieni lo stesso link.

Il QR non cambia perche contiene solo il link.

## Se vedi ancora la versione vecchia

Apri il sito con:

```text
?reset=1
```

Esempio:

```text
https://TUO-LINK.github.io/negozio2/?reset=1
```

Questa versione usa una nuova chiave dati locale, quindi evita il problema della vecchia memoria del browser. Con Firebase configurato, comunque i dati veri vengono letti online.
