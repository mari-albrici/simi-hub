# Fase 1D — Archivio documentale operativo

## Modello e migration

`010_phase1d_documents.sql` estende il modello esistente senza sostituire il bucket né spostare i file.

- `documents` rimane il documento logico. Nuovi campi: riferimento, paese, lingua, note, responsabile, nome normalizzato e puntatore alla versione corrente. Restano titolo, descrizione, categoria, date, società SIMI, autore, dipendente predisposto, access scope e archiviazione.
- `document_versions` conserva file, versione progressiva, etichetta, note, autore/data, SHA-256, nomi originale/Storage/normalizzato e stato upload. FK composta: una versione corrente può appartenere soltanto al proprio documento.
- `document_projects`, `document_companies`, `document_invoices` sono relazioni con FK esplicite e coppie univoche. Non usano ID polimorfici senza vincoli.
- I vecchi collegamenti diretti documento/commessa/controparte vengono copiati nelle relazioni; le vecchie colonne restano per compatibilità e non sono più la sorgente dei nuovi collegamenti.
- `document_categories` rimane autorevole: `parent_id` consente categoria e sottocategoria, con controllo di profondità e cicli. I nomi nel frontend provengono dal database. Le categorie 00–08 già esistenti restano disponibili.

Le view `document_invoice_context`, `document_project_context` e `document_company_context` combinano relazioni esplicite e relazioni derivate dal PDF principale della fattura. `UNION` impedisce duplicazioni. `document_register` espone metadata, contesti, ricerca e stato derivato. Tutte usano `security_invoker`.

RPC principali: `save_document_metadata`, `link_document_context`, `reserve_document_upload`, `finalize_document_version`, `fail_document_version`, `set_document_archive`, `document_events`, `project_document_categories`. Le RPC originali `reserve_document`, `finalize_document`, `fail_document_upload` restano compatibili e lavorano con le versioni.

## Versioni, file e duplicati

Il flusso comune, usato anche dai PDF fattura, è:

1. validare nome, estensione, MIME, firma del contenuto e dimensione (10 MB);
2. calcolare SHA-256 sul server;
3. cercare versioni già finalizzate con quel contenuto, applicando RLS;
4. prenotare documento/versione e percorso UUID;
5. caricare senza `upsert` nel bucket privato `simi-documents`;
6. verificare la presenza dell'oggetto Storage e finalizzare.

Il nome normalizzato segue `YYYY-MM-DD - Tipo - Descrizione.ext`. Il nome originale e il percorso Storage rimangono conservati per ciascuna versione. Cambiare il titolo logico non rinomina i file storici.

L'upload documentale mostra i duplicati e i loro contesti. L'utente può riusare un documento aggiungendo collegamenti, conservando i metadata esistenti, oppure confermare una nuova copia/versione. Il riuso tra società incompatibili viene rifiutato quando si collega a fatture/commesse. Una finalizzazione concorrente con hash uguale è serializzata tramite lock sull'hash e richiede conferma se un'altra versione è già pronta. Le ricerche duplicati non rivelano documenti non autorizzati.

Le nuove versioni mantengono disponibile quella corrente durante l'upload; soltanto la finalizzazione promuove la nuova versione. Una versione più vecchia finalizzata in ritardo non sostituisce una versione più recente già pubblicata. Le versioni pronte non sono modificabili via REST. La finalizzazione è idempotente.

Un errore Storage lascia una prenotazione `failed`, oppure `pending` se l'oggetto è effettivamente presente dopo un timeout. Un errore di finalizzazione conserva file e prenotazione e permette di riprovare dalla scheda documento. Nessuna eliminazione fisica automatica.

## Sicurezza e consultazione

Gli access scope sono `general` (standard), `restricted` (amministratore/amministrazione/direzione) e `hr` (permesso dipendenti). La presenza di `employee_id` continua a imporre la protezione HR. La classificazione viene salvata nella stessa transazione della prenotazione, prima del caricamento.

Versioni, contesti, ricerca, eventi e scadenze ereditano l'accesso al documento. I collegamenti a fatture/controparti richiedono inoltre il permesso di lettura della relativa entità. Il feed eventi restituisce solo metadata degli eventi reali, senza vecchi payload che potrebbero contenere dati riservati.

La route `/documenti/versioni/[version]/file` autorizza ogni richiesta e genera signed URL validi 300 secondi. Non vengono generati URL per tutte le righe dell'elenco. Preview PDF/immagini e download sono disponibili anche per versioni precedenti. I file archiviati richiedono prima il ripristino da parte di un ruolo con `document.delete`, coerentemente con la protezione Storage della Fase 0.

## Interfaccia e integrazioni

- Elenco compatto da 50 documenti per pagina: ricerca, ordinamento e filtri sul server per categoria, società, commessa, controparte, fattura, paese, stato, scadenza e date documento.
- Ricerca su titolo, descrizione, riferimento, nomi originali/normalizzati anche storici, codice/nome commessa e ragione sociale controparte.
- Dettaglio con metadata, preview, download, versioni, relazioni navigabili, modifica, aggiunta collegamenti, archiviazione/ripristino ed eventi reali.
- Upload da archivio, commessa, cliente, fornitore e fattura con contesto precompilato.
- Scheda commessa con categorie standard, comprese quelle vuote, conteggi aggregati e collegamenti agli elenchi filtrati.
- PDF principale fattura visibile in archivio, commesse e controparti tramite relazioni derivate. Gli allegati aggiuntivi non sostituiscono implicitamente il PDF principale.
- Corretto il campo PDF fattura esterno al form, ora associato esplicitamente al form; preservato il documento esistente durante la modifica fattura. La RPC fatture non promuove più un file a pronto senza finalizzazione.

## Scadenziario

`operational_deadlines` è estesa con una sola riga `document:<uuid>` per documento valido, pronto, non archiviato e con scadenza. Nessuna tabella di scadenze documentali o sincronizzazione periodica. Modifica data, sostituzione e archiviazione si riflettono alla lettura successiva. I collegamenti multipli e le versioni non moltiplicano gli eventi.

Gli stati salvati sono bozza/valido/sostituito, più `archived_at`; in scadenza/scaduto sono derivati. L'archivio considera in scadenza i prossimi 30 giorni; lo scadenziario mantiene le finestre della Fase 1C. Le scadenze manuali indipendenti collegate a documenti restano tali, senza cancellazioni o fusioni automatiche.

## Test

- `npm test`: validazione file, SHA-256, nomi, metadata/filtri, workflow upload e fallimenti, versioni e signed URL, oltre alle suite delle fasi precedenti.
- `npm run typecheck`.
- `npm run lint`.
- `npm run build` (fuori dal sandbox, per il subprocess TypeScript di Next).
- `bash scripts/test-sql.sh`: PostgreSQL 17 locale temporaneo, schema nuovo e upgrade legacy. `tests/sql/phase1d.sql` copre finalizzazione, file assente, errore upload, duplicati/conferma, versioni correnti/storiche, nomi, multicontesto, ricerca, scadenze/assenza duplicati, modifica date, sostituzione, archiviazione/ripristino, categorie vuote, audit, RBAC/RLS e accesso Storage.

## Operazioni manuali Supabase

1. Verificare che 001–009 siano applicate e predisporre il consueto backup.
2. Revisionare e applicare soltanto `010_phase1d_documents.sql` tramite la procedura amministrativa autorizzata. Richiede PostgreSQL 15+ per le view `security_invoker`; testata su 17.
3. Distribuire il codice applicativo dopo la migration.
4. Verificare documenti legacy senza società/categoria, stati non standard, relazioni orfane eventualmente già presenti e prenotazioni pendenti/fallite. Le versioni iniziali mantengono i dati legacy; non vengono inventati valori mancanti.
5. Se necessario configurare sottocategorie tramite `document_categories` con un account autorizzato.
6. Effettuare lo smoke test con Storage Supabase reale: upload, preview/download di due versioni, duplicato, ripristino, scadenza e accessi con ruoli differenti.

Non è stata applicata alcuna migration al Supabase remoto e non è stato eseguito `supabase db push`.

## Limiti residui

- Nessun modulo HR, ordine, DDT, contratto o offerta nuovo: sono predisposti accessi e schema estendibile con FK quando esisteranno le sorgenti.
- Nessun backfill automatico degli hash dei file legacy: occorre leggere i byte reali con un'operazione amministrativa dedicata. Gli hash mancanti sono mostrati esplicitamente.
- Eventuali vecchi `version_of_id` restano conservati; non vengono consolidati automaticamente documenti logici già distinti.
- Configurazione categorie nel database, senza una nuova UI amministrativa dedicata.
- La ricerca è testuale, non semantica; nessuna indicizzazione del contenuto PDF in questa fase.
- Test locali del contratto Storage/RLS e test applicativi del client firmato; nessun upload o smoke test sul Supabase remoto.
