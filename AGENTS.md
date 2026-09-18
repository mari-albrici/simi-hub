# SIMI GESTIONALE — SPECIFICA FUNZIONALE

Il gestionale è il portale amministrativo interno di **SIMI S.r.l.** e deve progressivamente centralizzare commesse, fatture, documenti, dipendenti, fornitori, clienti, scadenze, procedure interne e controllo amministrativo.

Il sistema NON deve essere progettato come semplice archivio documentale.

Ogni informazione deve, quando possibile, essere strutturata, collegabile e ricercabile.

Le entità principali devono poter essere collegate tra loro:

**Nazione ↔ Commessa ↔ Cliente ↔ Fornitore ↔ Fattura ↔ DDT ↔ Documento ↔ Dipendente ↔ Scadenza ↔ Attività**

---

# 1. GESTIONE MULTI-NAZIONE

SIMI opera attraverso più entità/sedi.

Il gestionale deve prevedere almeno:

* SIMI Italia
* SIMI France
* SIMI Luxembourg

Ogni record rilevante deve avere un campo `country/entity`.

Applicarlo almeno a:

* fatture;
* documenti;
* dipendenti;
* commesse;
* clienti;
* fornitori;
* contratti;
* DDT;
* certificati;
* scadenze;
* attività.

## UI

Mostrare un tag visivo immediato.

Preferibilmente:

🇮🇹 IT
🇫🇷 FR
🇱🇺 LUX

Il tag deve essere visibile nelle tabelle senza dover aprire il record.

Prevedere filtri:

Tutte | IT | FR | LUX

Il sistema deve essere estendibile ad altre entità/nazioni senza modifiche strutturali importanti.

---

# 2. DASHBOARD AMMINISTRATIVA

La dashboard deve essere una scrivania operativa.

Mostrare almeno:

* fatture da pagare;
* fatture da incassare;
* fornitori scaduti;
* clienti scaduti;
* scadenze prossimi 7 giorni;
* anomalie;
* attività che richiedono attenzione;
* prossime scadenze;
* situazione fornitori;
* situazione clienti;
* entrate/uscite previste;
* commesse che richiedono attenzione.

Ogni KPI deve essere cliccabile e portare al relativo elenco filtrato.

---

# 3. FATTURE FORNITORI

Il sistema deve permettere di:

* inserire manualmente una fattura;
* caricare PDF;
* archiviare PDF originale;
* associare fornitore;
* associare SIMI IT/FR/LUX;
* associare una o più commesse;
* registrare numero fattura;
* data documento;
* data registrazione;
* data ricezione;
* imponibile;
* IVA;
* totale;
* valuta;
* scadenza;
* metodo di pagamento;
* stato pagamento;
* note;
* eventuale DDT;
* eventuale ordine;
* eventuale contratto.

Stati indicativi:

* da verificare;
* da registrare;
* registrata;
* da pagare;
* pagamento programmato;
* pagata;
* parzialmente pagata;
* scaduta;
* contestata;
* nota di credito;
* annullata.

---

# 4. LETTURA AUTOMATICA FATTURE PDF SENZA AI

Quando viene caricato un PDF contenente testo digitale, il sistema deve tentare automaticamente l'estrazione del testo.

NON utilizzare AI/LLM per questa funzione.

Utilizzare parsing PDF deterministico.

Lingue iniziali:

* italiano;
* francese.

Il parser deve tentare di identificare:

* fornitore;
* partita IVA / TVA;
* numero fattura;
* data fattura;
* valuta;
* imponibile;
* IVA;
* aliquota IVA;
* totale;
* scadenza;
* IBAN, se presente;
* riferimento ordine;
* riferimento commessa;
* righe fattura.

I valori estratti NON devono essere considerati automaticamente corretti.

Mostrare una schermata di verifica prima del salvataggio definitivo.

---

# 5. RIGHE FATTURA

Una fattura non deve essere salvata soltanto come totale.

Prevedere struttura header + invoice lines.

Ogni riga può contenere:

* descrizione;
* quantità;
* unità;
* prezzo unitario;
* sconto;
* imponibile;
* aliquota IVA;
* importo IVA;
* totale riga;
* commessa;
* centro di costo futuro;
* note.

Una singola fattura può riguardare più commesse.

Permettere quindi l'attribuzione delle singole righe a commesse differenti.

---

# 6. IVA

Gestire correttamente:

* imponibile;
* aliquota;
* importo IVA;
* totale documento;
* più aliquote nella stessa fattura;
* esenzione;
* reverse charge;
* fuori campo;
* eventuali casistiche IT/FR/LUX.

Non assumere automaticamente IVA italiana al 22%.

---

# 7. RATE E SCADENZIARIO FATTURA

Una fattura può avere una o più scadenze.

Esempio:

Totale €30.000

30% → €9.000 → 30/09/2026
40% → €12.000 → 31/10/2026
30% → €9.000 → 30/11/2026

Creare entità separate per le rate/scadenze.

Ogni rata deve avere:

* importo;
* data scadenza;
* stato;
* data pagamento;
* metodo pagamento;
* riferimento pagamento;
* note.

La somma delle rate deve essere confrontata con il totale fattura.

Segnalare eventuali incongruenze.

---

# 8. FATTURE CLIENTI

Prevedere struttura analoga alle fatture fornitori.

Gestire:

* cliente;
* nazione;
* commessa;
* numero fattura;
* data;
* imponibile;
* IVA;
* totale;
* scadenze;
* incassi;
* stato.

Stati:

* emessa;
* inviata;
* da incassare;
* parzialmente incassata;
* incassata;
* scaduta;
* contestata;
* nota di credito.

---

# 9. NOTE DI CREDITO

Gestire note di credito come documenti collegabili alla fattura originale.

Mostrare:

* fattura originale;
* importo originale;
* nota di credito;
* importo rettificato;
* saldo residuo.

---

# 10. PAGAMENTI E INCASSI

Registrare:

* importo;
* data;
* fattura;
* rata;
* fornitore/cliente;
* metodo;
* riferimento;
* conto;
* note.

Una fattura può avere più pagamenti.

Calcolare automaticamente:

* pagato;
* residuo;
* stato.

---

# 11. SCADENZIARIO GENERALE

Creare un unico scadenziario centralizzato.

Deve contenere scadenze provenienti da:

* fatture;
* rate;
* contratti;
* documenti dipendenti;
* visite mediche;
* corsi;
* assicurazioni;
* DURC;
* certificati;
* fideiussioni;
* commesse;
* adempimenti;
* scadenze manuali.

Viste:

* oggi;
* settimana;
* mese;
* calendario;
* elenco.

---

# 12. PROMEMORIA

Ogni scadenza deve poter avere:

* data scadenza;
* data primo avviso;
* priorità;
* responsabile;
* stato.

Esempio:

Visita medica scade 30/11.

Promemoria dal 30/10.

---

# 13. COMMESSE

Ogni commessa deve avere una propria scheda.

Campi indicativi:

* numero commessa;
* denominazione;
* cliente;
* nazione;
* luogo;
* data apertura;
* data chiusura;
* stato;
* referente;
* descrizione;
* note.

Stati:

* preparazione;
* attiva;
* sospesa;
* completata;
* chiusa;
* archiviata.

---

# 14. DASHBOARD COMMESSA

Dentro ogni commessa mostrare una dashboard dedicata con:

* informazioni principali;
* cliente;
* documenti;
* fatture fornitori;
* fatture clienti;
* DDT;
* ordini;
* contratti;
* fornitori coinvolti;
* dipendenti coinvolti;
* scadenze;
* attività;
* anomalie.

In futuro:

* costi;
* ricavi;
* margine;
* pagato;
* incassato;
* esposizione.

---

# 15. DOCUMENTI COMMESSA

Utilizzare una classificazione standard coerente per tutte le commesse.

Categorie principali:

00 Anagrafica commessa
01 Contratti e Ordini
02 Offerte e Preventivi
03 Corrispondenza
04 Documentazione Tecnica
05 Fornitori e Acquisti
06 DDT e Logistica
07 Fatture e Contabilità
08 Certificati e Dichiarazioni

Prevedere eventuali categorie aggiuntive senza rompere la struttura.

---

# 16. DIPENDENTI

Creare anagrafica dipendenti.

Campi:

* nome;
* cognome;
* entity/nazione;
* matricola;
* codice fiscale;
* eventuale identificativo fiscale estero;
* data nascita;
* data assunzione;
* data cessazione;
* mansione;
* livello;
* tipologia contratto;
* stato;
* email;
* telefono;
* note.

Non tutti i campi devono necessariamente essere obbligatori.

---

# 17. FASCICOLO DIGITALE DIPENDENTE

Ogni dipendente deve avere una propria sezione documentale.

Categorie iniziali:

## Identità

* carta d'identità;
* codice fiscale;
* passaporto;
* permesso di soggiorno, se applicabile.

## Contrattuale

* contratto di lavoro;
* proroghe;
* trasformazioni;
* lettere;
* documentazione assunzione;
* cessazione.

## Salute e sicurezza

* idoneità medica;
* visite;
* attestati;
* corsi sicurezza;
* formazione;
* DPI, se gestiti.

## Amministrativo

* documenti fiscali;
* coordinate bancarie;
* altra documentazione.

Ogni documento deve poter avere:

* tipo;
* file;
* data documento;
* data rilascio;
* data scadenza;
* note;
* stato.

---

# 18. SCADENZE DIPENDENTI

Il sistema deve generare automaticamente scadenze per documenti che lo prevedono.

Esempi:

* idoneità medica;
* corsi sicurezza;
* patentini;
* certificazioni;
* permessi;
* documenti d'identità.

Dashboard HR:

"5 documenti dipendenti scadono entro 30 giorni".

---

# 19. CHECKLIST ASSUNZIONE

Creare checklist configurabile per nuove assunzioni.

Esempio:

☐ Contratto firmato
☐ Documento identità
☐ Codice fiscale
☐ Comunicazione assunzione
☐ IBAN
☐ Visita medica
☐ Formazione sicurezza
☐ DPI
☐ Account aziendale
☐ Altra documentazione richiesta

La checklist deve poter variare in base alla nazione.

---

# 20. CHECKLIST CESSAZIONE

Prevedere anche processo di uscita:

* documentazione;
* restituzione strumenti;
* chiusura accessi;
* documentazione amministrativa;
* eventuali scadenze.

---

# 21. FORNITORI

Anagrafica fornitori con:

* ragione sociale;
* nome breve;
* paese;
* partita IVA/TVA;
* codice fiscale;
* indirizzo;
* email;
* PEC;
* telefono;
* IBAN;
* condizioni pagamento;
* note.

Collegamenti:

* fatture;
* ordini;
* DDT;
* contratti;
* commesse;
* documenti;
* pagamenti.

---

# 22. CLIENTI

Struttura analoga.

Collegamenti:

* commesse;
* contratti;
* offerte;
* fatture;
* incassi;
* documenti;
* contatti.

---

# 23. CONTATTI

Cliente e fornitore possono avere più persone di riferimento.

Campi:

* nome;
* cognome;
* ruolo;
* email;
* telefono;
* lingua;
* note.

---

# 24. DDT / DOCUMENTI DI TRASPORTO

Gestire DDT in ingresso e uscita.

Campi:

* numero;
* data;
* fornitore/cliente;
* commessa;
* nazione;
* documento PDF;
* righe;
* note.

Collegamenti:

DDT ↔ ordine
DDT ↔ fattura
DDT ↔ commessa

---

# 25. CONTROLLO DDT SENZA FATTURA

Il sistema deve poter evidenziare automaticamente:

* DDT senza fattura collegata;
* fatture che citano DDT non presenti;
* eventuali duplicati.

Questi elementi devono apparire nelle anomalie.

---

# 26. ORDINI

Gestire:

* ordini clienti;
* ordini fornitori.

Campi:

* numero;
* data;
* soggetto;
* commessa;
* importo;
* valuta;
* stato;
* documento;
* note.

Collegamenti:

Ordine ↔ DDT ↔ Fattura.

---

# 27. OFFERTE / PREVENTIVI

Archiviare e classificare:

* offerte ricevute;
* offerte emesse.

Prevedere collegamento a:

* cliente/fornitore;
* commessa;
* ordine successivo;
* contratto.

---

# 28. CONTRATTI

Archivio contratti.

Tipologie:

* clienti;
* fornitori;
* dipendenti;
* subappalti;
* altri.

Campi:

* controparte;
* data;
* decorrenza;
* scadenza;
* rinnovo;
* commessa;
* documento;
* note.

---

# 29. ARCHIVIO DOCUMENTALE GENERALE

Ogni documento deve avere metadata strutturati.

Almeno:

* titolo;
* categoria;
* entity/nazione;
* data;
* commessa;
* cliente;
* fornitore;
* dipendente;
* scadenza;
* tag;
* note;
* file originale.

Non tutti i collegamenti sono obbligatori.

---

# 30. VERSIONI DOCUMENTI

Quando utile, prevedere versioning.

Esempio:

Contratto v1
Contratto revisionato
Contratto firmato

Non sovrascrivere silenziosamente documenti importanti.

---

# 31. RICERCA GLOBALE

Inserire ricerca globale.

Deve poter trovare almeno:

* numero commessa;
* cliente;
* fornitore;
* dipendente;
* numero fattura;
* numero DDT;
* numero ordine;
* documento;
* descrizione.

La ricerca deve portare direttamente al record.

---

# 32. FILTRI

Le principali tabelle devono supportare combinazioni di filtri:

* nazione;
* commessa;
* cliente;
* fornitore;
* stato;
* periodo;
* scadenza;
* importo;
* categoria.

---

# 33. CENTRO ANOMALIE

Creare sistema centralizzato per anomalie.

Esempi:

* fattura scaduta;
* incasso scaduto;
* fattura senza commessa;
* DDT senza fattura;
* documento scaduto;
* documento dipendente mancante;
* corso scaduto;
* visita medica scaduta;
* rata incoerente;
* totale rate diverso dal totale fattura;
* documento senza classificazione;
* commessa incompleta.

Se l'anomalia viene risolta, deve poter essere chiusa automaticamente o manualmente.

---

# 34. ATTIVITÀ / TO-DO

Prevedere attività interne.

Campi:

* titolo;
* descrizione;
* responsabile;
* priorità;
* scadenza;
* stato;
* commessa;
* entità collegata.

Stati:

* da fare;
* in corso;
* bloccata;
* completata.

---

# 35. SEZIONE GUIDA / KNOWLEDGE BASE

Creare una sezione:

**Guide e Procedure**

Deve funzionare come manuale operativo interno SIMI.

Struttura:

Categoria
→ Sottocategoria
→ Guida

Esempi categorie:

## eSolver

* registrazione fatture;
* movimenti;
* anagrafiche;
* procedure specifiche.

## Contabilità

* fatture;
* note di credito;
* pagamenti;
* cespiti;
* procedure di fine mese.

## Dipendenti

* nuova assunzione;
* cessazione;
* documentazione;
* checklist.

## Francia

* procedure amministrative;
* documenti;
* adempimenti.

## Gestionale SIMI

* come creare una commessa;
* come caricare una fattura;
* come gestire una scadenza;
* FAQ.

---

# 36. CONTENUTO GUIDE

Una guida deve poter contenere:

* titolo;
* testo formattato;
* immagini;
* PDF;
* allegati;
* link interni;
* sottosezioni;
* checklist;
* note.

Deve essere possibile creare nuove categorie e sottocategorie senza modificare il codice.

---

# 37. PDF NELLE GUIDE

Consentire caricamento di PDF.

Il PDF deve:

* essere archiviato;
* poter essere visualizzato;
* poter essere scaricato dagli utenti autorizzati;
* essere collegato alla guida.

---

# 38. CHECKLIST PROCEDURALI

Le guide possono contenere checklist riutilizzabili.

Esempio:

"Assunzione dipendente Francia"

con elenco completo delle attività.

Distinguere una semplice checklist informativa da una checklist operativa associata a uno specifico dipendente/commessa.

---

# 39. PREFERITI / GUIDE IMPORTANTI

Permettere di evidenziare procedure utilizzate frequentemente.

Esempio:

★ Registrazione fattura Francia
★ Nuovo dipendente
★ Apertura commessa

---

# 40. UTENTI

Autenticazione tramite account aziendale.

Ogni utente deve avere:

* nome;
* email;
* ruolo;
* stato;
* eventuali permessi.

---

# 41. RUOLI E PERMESSI

Predisporre RBAC.

Ruoli indicativi:

* amministratore;
* amministrazione;
* HR;
* tecnico;
* sola lettura.

I permessi devono poter essere raffinati in futuro.

Esempio:

HR vede fascicoli dipendenti.

Tecnico vede commesse e documentazione tecnica ma non necessariamente informazioni retributive.

---

# 42. AUDIT LOG

Le operazioni amministrativamente rilevanti devono essere tracciabili.

Registrare almeno:

* utente;
* azione;
* record;
* data/ora;
* modifica effettuata.

Esempi:

"Fattura modificata"

"Pagamento registrato"

"Documento dipendente eliminato"

"Scadenza modificata"

---

# 43. ELIMINAZIONE

Evitare eliminazioni irreversibili accidentali.

Utilizzare soft delete/archiviazione per record importanti quando appropriato.

Richiedere conferma per operazioni distruttive.

---

# 44. ALLEGATI

Le entità principali devono poter avere allegati.

Esempio:

fattura → PDF
dipendente → CI
commessa → contratto
fornitore → certificazione
guida → manuale PDF

Centralizzare la gestione file quanto possibile.

---

# 45. ANTEPRIMA DOCUMENTI

Permettere anteprima almeno di:

* PDF;
* immagini.

L'utente non dovrebbe essere costretto a scaricare ogni documento per controllarlo.

---

# 46. NOMI FILE

Quando il gestionale genera o archivia file, utilizzare naming coerente.

Formato preferenziale:

YYYY-MM-DD - Documento - Descrizione opzionale.ext

Non modificare necessariamente il file originale senza conservarne traccia.

---

# 47. DUPLICATI

Prevedere controllo hash dei file caricati.

Se viene caricato un file identico a uno già presente:

"Questo documento risulta già presente."

Mostrare dove si trova.

Non creare automaticamente duplicati senza avviso.

---

# 48. COLLEGAMENTI TRA RECORD

Elemento fondamentale del gestionale.

Esempio:

aprendo una fattura devo poter raggiungere:

→ fornitore
→ commessa
→ DDT
→ ordine
→ pagamento
→ PDF

Aprendo una commessa:

→ cliente
→ fatture
→ ordini
→ DDT
→ documenti
→ dipendenti
→ scadenze

Evitare archivi separati che non comunicano tra loro.

---

# 49. TIMELINE

Per entità importanti prevedere una timeline.

Esempio commessa:

12/01 apertura
20/01 ordine cliente
25/01 ordine fornitore
10/02 DDT
15/02 fattura
28/02 pagamento

Può essere implementata progressivamente.

---

# 50. NOTE INTERNE

Consentire note interne sui record.

Esempio:

"Contattato fornitore il 15/09, attesa nota di credito."

Le note devono riportare autore e data.

---

# 51. CONTROLLO DI GESTIONE FUTURO

Preparare l'architettura per futuro controllo economico per commessa.

Dati previsti:

* valore contratto;
* ricavi;
* costi;
* ordini;
* fatture fornitori;
* fatture clienti;
* pagamenti;
* incassi;
* margine;
* esposizione;
* forecast.

NON inventare valori se il modulo non è ancora implementato.

---

# 52. REPORT

Predisporre report almeno per:

* scadenze;
* fatture da pagare;
* fatture da incassare;
* fatture scadute;
* documenti dipendenti in scadenza;
* situazione commesse.

In futuro prevedere esportazione Excel/PDF.

---

# 53. NOTIFICHE INTERNE

Creare centro notifiche.

Esempi:

"3 fatture scadono oggi."

"Idoneità medica Mario Rossi scade tra 15 giorni."

"DDT 456 non ha una fattura associata."

"C1072 ha documentazione mancante."

Le notifiche devono portare al record interessato.

---

# 54. HOMEPAGE PERSONALIZZABILE IN FUTURO

Predisporre l'architettura affinché in futuro la dashboard possa mostrare widget differenti in base al ruolo.

Esempio:

Amministrazione → fatture/scadenze.

HR → dipendenti/documenti.

Tecnico → commesse/documentazione.

Non è necessario implementare subito la personalizzazione completa.

---

# 55. IMPORTAZIONE DATI

Predisporre procedure future per importazione massiva tramite:

* CSV;
* Excel.

Particolarmente importante per:

* fornitori;
* clienti;
* dipendenti;
* commesse;
* fatture storiche.

L'importazione deve avere preview e validazione prima della scrittura definitiva.

---

# 56. VALIDAZIONE DATI

Validare almeno:

* date;
* importi;
* partita IVA;
* IBAN;
* email;
* totali fattura;
* somme rate;
* duplicati.

Non bloccare però casistiche estere solo perché non rispettano formati italiani.

---

# 57. MULTILINGUA DEI DATI

Il gestionale può avere inizialmente UI italiana.

I dati devono però supportare documentazione almeno:

* italiana;
* francese;
* lussemburghese/internazionale.

Non assumere che documenti e identificativi abbiano sempre formato italiano.

---

# 58. SICUREZZA

I documenti amministrativi non devono essere pubblicamente accessibili.

Utilizzare Supabase Storage privato e signed URL o meccanismo equivalente.

Applicare correttamente RLS.

Non affidarsi solamente a controlli frontend.

---

# 59. PRIVACY DIPENDENTI

La documentazione personale dei dipendenti richiede permessi più restrittivi rispetto alla normale documentazione di commessa.

Separare logicamente autorizzazioni e accessi.

---

# 60. DESIGN

Utilizzare Bootstrap come sistema UI principale.

Design:

* pulito;
* amministrativo;
* professionale;
* denso ma leggibile;
* desktop-first;
* responsive;
* niente estetica da landing page;
* niente gradienti o decorazioni inutili.

Utilizzare Bootstrap Icons invece di emoji per le normali azioni UI.

Le bandiere possono essere utilizzate specificamente come indicatore della nazione.

---

# 61. TABELLE

Le tabelle sono centrali.

Prevedere quando necessario:

* ricerca;
* ordinamento;
* filtri;
* paginazione;
* selezione;
* azioni rapide;
* colonne configurabili in futuro.

Evitare di sostituire tabelle amministrative complesse con grandi card.

---

# 62. AZIONI RAPIDE

Da dashboard/navbar prevedere progressivamente:

* Nuova fattura
* Nuova commessa
* Nuovo documento
* Nuovo dipendente
* Nuova scadenza
* Nuova attività

---

# 63. DATI REALI

Regola fondamentale:

NON utilizzare dati mock nella versione operativa.

Se un modulo non dispone ancora dei dati necessari:

* mostrare empty state;
* predisporre schema;
* indicare cosa manca.

Non mostrare KPI inventati.

---

# 64. ARCHITETTURA

Il gestionale deve essere modulare.

Evitare componenti monolitici.

Separare:

* UI;
* business logic;
* accesso Supabase;
* validazione;
* parsing documenti;
* autorizzazioni.

Le funzionalità condivise devono essere centralizzate.

---

# 65. PRINCIPIO GENERALE

Prima di implementare una nuova funzionalità chiedersi sempre:

"Questa informazione esiste già in un'altra entità?"

Se sì, creare una relazione invece di duplicarla.

Esempio:

NON salvare "SALTI S.r.l." come semplice stringa dentro ogni fattura se esiste il record fornitore.

Utilizzare `supplier_id`.

Lo stesso principio vale per:

* clienti;
* commesse;
* dipendenti;
* documenti;
* ordini;
* DDT.

---

# 66. OBIETTIVO FINALE

Il gestionale deve progressivamente diventare il punto centrale da cui l'ufficio SIMI può capire:

* cosa deve fare oggi;
* cosa è scaduto;
* cosa sta per scadere;
* cosa deve essere pagato;
* cosa deve essere incassato;
* dove si trova un documento;
* a quale commessa appartiene;
* quali documenti mancano;11
* quale dipendente ha documentazione incompleta;
* quali anomalie amministrative esistono;
* qual è la situazione di una commessa;
* come deve essere svolta una procedura interna.

L'obiettivo non è digitalizzare il disordine esistente.

L'obiettivo è creare una struttura unica e coerente in cui ogni informazione venga inserita una volta e poi riutilizzata in tutto il sistema.
