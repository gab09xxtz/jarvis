# J.A.R.V.I.S.

**Just A Rather Very Intelligent System**  
Assistente personale vocale ispirato a JARVIS di Iron Man.

## Demo live

https://gab09xxtz.github.io/jarvis/

## Funzionalità

- Sfera di particelle olografica che reagisce alla voce
- Sintesi e riconoscimento vocale in italiano
- Cronologia della conversazione visibile durante la sessione
- Note salvate localmente nel browser
- Lista della spesa salvata localmente
- Timer vocali fino a 24 ore
- Comandi domotici dimostrativi (non controllano dispositivi reali)

### Comandi principali

**Luci**
- "Accendi le luci del soggiorno / cucina / camera / bagno"
- "Spegni tutte le luci"
- "Stato delle luci"

**Clima**
- "Imposta la temperatura a 22 gradi"
- "Alza / abbassa la temperatura"
- "Che temperatura c'è?"

**TV & Musica**
- "Accendi / spegni la TV"
- "Metti la musica" / "Ferma la musica"
- "Alza / abbassa il volume" / "Volume a 50"

**Timer**
- "Timer di 10 minuti"
- "Cancella il timer"

**Lista della spesa**
- "Aggiungi alla lista della spesa il latte"
- "Cosa c'è nella lista della spesa?"
- "Svuota la lista della spesa"

**Routine**
- "Buongiorno" → accende luci principali + temperatura
- "Buonanotte" → spegne tutto
- "Modalità cinema"
- "Esco di casa"

**Note**
- "Scrivi una nota: ricordati di chiamare Marco"
- "Leggi le note" / "Cancella le note"

**Timer**
- "Timer di 10 minuti" / "Annulla timer"

**Lista della spesa**
- "Aggiungi alla lista della spesa il latte"
- "Cosa c'è nella lista della spesa?" / "Svuota la lista della spesa"

## Prossimi passi

- Collegamento reale ad Alexa / Home Assistant
- Integrazione con AI (Grok)
- Memoria delle conversazioni

---

*Creato con ❤️*


## Supabase

Jarvis usa Supabase per account e sincronizzazione cloud delle note e della lista della spesa.

- Project URL: `https://mjljfpnjgfjxgtozwnre.supabase.co`
- Il frontend usa una **publishable key**: è pensata per essere pubblica e non concede accesso oltre le policy RLS.
- Non inserire mai una secret key o una service-role key nel frontend o nel repository.
- Tabelle predisposte: `notes`, `shopping_items` e `chat_messages`.
- RLS è attiva su tutte e tre le tabelle; ogni utente autenticato può operare solo sulle proprie righe.
- L'interfaccia permette registrazione e accesso con email/password. Se la conferma email è attiva, bisogna confermare l'indirizzo prima del primo accesso.
- Note e lista spesa restano locali quando non si è autenticati; dopo l'accesso le nuove operazioni vengono salvate su Supabase.

La cronologia chat non è ancora collegata alla tabella `chat_messages`.
