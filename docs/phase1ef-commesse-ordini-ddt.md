# Fase 1F.1B — Completamento Ordini e DDT

## Ambito e situazione iniziale

La fase completa il lavoro 1F.1 senza avviare 1F.2. Erano già presenti:

- migrazione 012 per commesse, 013 per Ordini/DDT e 014 per RBAC;
- liste, creazione, dettagli essenziali, archiviazione e righe;
- relazioni tra intestazioni e collegamento riga DDT → riga ordine;
- creazione dalla commessa con precompilazione;
- infrastruttura documentale 1D e modulo fatture/pagamenti.

Mancavano modifica sicura, selezione operativa delle righe ordine, proposta dei
residui, stati derivati, collegamenti documentali e fatture utilizzabili,
anomalie specifiche e dettagli completi. Le funzioni precedenti cancellavano
le righe durante la modifica: la nuova implementazione conserva gli ID.

## Migrazione

Aggiunta `015_phase1f_completion.sql`. Le migrazioni 013 e 014 non vengono
riscritte da questa fase. `supabase/schema.sql` include la 015 e lo script SQL
verifica anche l'aggiornamento additivo da dati legacy.

La 015 estende le funzioni di salvataggio, aggiunge vincoli applicativi nel
database, viste quantitative, anomalie, audit, RPC per collegamenti e
`commercial_invoice_lines`. Aggiunge `allocated_amount` a `order_invoices`.
Le tabelle documentali introdotte nella 013 vengono riutilizzate.

Nessuna migrazione è stata applicata al Supabase remoto e non è stato eseguito
`supabase db push`. I test SQL usano un PostgreSQL Docker temporaneo.

## Modifica e integrità

Ordine e DDT dispongono di pagina di modifica e salvataggio con ritorno al
dettaglio. La validazione è presente nel form, nelle server action e nelle RPC.
Un token `expected_updated_at` impedisce il salvataggio su una versione obsoleta.

Le righe esistenti sono aggiornate tramite ID, verificandone appartenenza e
unicità. Vengono eliminate soltanto le righe rimosse esplicitamente dal form;
le foreign key impediscono l'eliminazione di righe ancora referenziate, anche
in documenti archiviati. Gli errori mantengono aperto il form con i valori inseriti.

Non è consentito ridurre una quantità ordinata sotto il già consegnato. Le
compatibilità di società, controparte, tipo/direzione, commessa e unità sono
verificate anche nel database. Un ordine con consegne attive non può essere
riportato in bozza o annullato. Le operazioni del ciclo usano un lock
transazionale condiviso per serializzare le proprie mutazioni.

## Ordine → DDT a livello riga

La fonte quantitativa è `delivery_note_lines.order_line_id`, che riferisce
`order_lines.id`. Più righe DDT, anche di DDT diversi, possono riferire la stessa
riga ordine. Il collegamento di intestazione viene ricavato anche da tali righe;
un collegamento alla sola intestazione non attribuisce quantità.

Il form DDT permette di scegliere ordine e riga senza UUID manuali. Le opzioni
sono limitate a ordini attivi, non in bozza né annullati, con società,
controparte e direzione compatibili. Il filtro per commessa viene applicato
quando la commessa della riga è specificata. Sono mostrati numero e data ordine,
controparte, descrizione, quantità ordinata, consegnata e residua.

`Crea DDT` nel dettaglio ordine propone le righe ancora da evadere e le quantità
residue, insieme a direzione, società, controparte e commesse delle righe.
L'utente deve inserire numero/data e confermare il salvataggio; può modificare
le quantità effettive. Durante la modifica di un DDT, le sue quantità vengono
restituite al residuo proposto per evitare di contarle due volte.

## Consegne parziali e stato

`order_line_progress` aggrega soltanto i DDT non archiviati.
`order_reconciliation.fulfillment_status` deriva lo stato senza richiedere un
aggiornamento manuale del campo amministrativo dell'ordine:

| Caso | Risultato |
| --- | --- |
| Nessuna consegna, ordine confermato | Confermato / non evaso |
| Ordinato 100, DDT 40 | Residuo 60, parzialmente evaso |
| Ordinato 100, DDT 40 + 60 | Residuo 0, evaso |
| Ordinato 100, DDT 110 | Residuo −10, sovraconsegna |
| Più righe | Evasione completa solo se tutte le righe sono evase |

La sovraconsegna è registrabile, visibile nel form e segnalata come anomalia.
Il valore consegnato è proporzionale al totale della riga ordine, inclusi
sconto e IVA; non è una misura contabile autonoma.

## Ordine/DDT → fattura

Sono riutilizzate le relazioni molti-a-molti `order_invoices` e
`delivery_note_invoices`. È consentita una fattura senza DDT e un DDT senza
ordine; un DDT può avere più fatture e una fattura più DDT.

I collegamenti verificano società, controparte e tipo/direzione. Per gli ordini
è richiesta anche la stessa valuta: nessuna conversione implicita.
`allocated_amount` rappresenta l'importo fattura attribuito all'ordine. Se non
viene specificato, il valore fatturato e la differenza sono dichiarati non
determinabili; non si attribuisce automaticamente l'intera fattura a ogni
ordine. La somma delle attribuzioni non può superare il totale fattura.

`commercial_invoice_lines` registra la quantità di una riga fattura riferita
a una riga ordine e/o a una riga DDT. Quando il DDT riferisce un ordine, tale
relazione viene conservata nell'attribuzione. Commessa e unità devono coincidere.
Le quantità attribuite non possono superare la riga fattura né la riga DDT.
Le quantità e gli importi attribuiti sono distinti: il collegamento di sole
intestazioni non consente di inferire quantità fatturate.

Per scollegare un'intestazione con attribuzioni quantitative occorre prima
rimuovere le attribuzioni: il database blocca collegamenti incoerenti. Le
modifiche a fatture e righe fattura sono soggette a controlli differiti di
integrità per le nuove relazioni, senza riscrivere pagamenti o allocazioni
finanziarie esistenti.

## Documenti

`Carica documento` apre il modulo 1D esistente con categoria e metadata
precompilati: `01 Contratti e Ordini` oppure `06 DDT e Logistica`.
Si possono anche collegare documenti logici esistenti della stessa società.

Il percorso usa prenotazione, Storage privato, SHA-256, controllo duplicati,
finalizzazione, `document_versions`, signed URL e audit già esistenti. Il riuso
di un duplicato aggiunge la relazione senza creare un nuovo file. Le successive
versioni si caricano dalla scheda del documento logico.

Le viste `document_project_context` e `document_company_context` derivano le
commesse e le controparti dalle relazioni ordine/DDT, per rendere disponibile lo
stesso documento nei fascicoli senza duplicare file o metadata. I collegamenti
documentali seguono i permessi di visibilità del documento.

## Archiviazione

Non sono introdotte eliminazioni definitive di Ordini/DDT. L'archiviazione:

- conserva intestazioni, righe, fatture, documenti e audit;
- rende il record consultabile dal dettaglio, senza azioni di modifica;
- esclude il DDT dalle quantità consegnate e ricalcola stato/residui dell'ordine;
- esclude l'ordine dalle aggregazioni operative;
- non archivia automaticamente fatture o documenti collegati;
- non genera anomalie operative per il record archiviato.

L'archiviazione del DDT non annulla le fatture né le attribuzioni già registrate.
Non è prevista in questa fase un'azione di ripristino Ordini/DDT.

## Anomalie specifiche

La vista `commercial_anomalies` distingue:

| Segnalazione | Livello |
| --- | --- |
| Sovraconsegna | Anomalia |
| Importo fatturato attribuito superiore al valore ordine | Anomalia |
| Ordine parzialmente evaso | Attenzione |
| Ordine confermato senza consegne | Informazione |
| DDT senza ordine | Informazione |
| DDT senza fattura attiva | Informazione |
| Fattura collegata a ordine senza DDT | Informazione |

Le incoerenze quantitative non ammesse sono bloccate al salvataggio. L'assenza
di ordine o DDT non viene classificata automaticamente come errore. Non è stato
creato un centro anomalie generale.

## Percorsi UI implementati

- Liste Ordini/DDT → Nuovo → Salva → Dettaglio.
- Dettaglio → Modifica → Salva → Dettaglio aggiornato.
- Ordine → Crea DDT → quantità residue → conferma salvataggio.
- DDT → Modifica → selezione ordine/riga.
- Ordine/DDT → Collega fattura, scollega e attribuisci quantità per riga.
- Ordine/DDT → Carica documento o collega documento esistente.
- Fattura → sezione Ciclo documentale → Ordini/DDT navigabili e collega/scollega.
- Commessa → Ordini/DDT reali e creazione con commessa precompilata.
- Dettaglio → Archivia con conferma e conservazione della consultazione.

La quota economica ordine nella commessa somma soltanto le righe attribuite a
quella commessa; il totale di un ordine multicommessa non viene replicato su
ogni commessa. Le valute restano esplicite e separate.

Questi percorsi sono implementati nel codice, ma **non sono stati certificati
con una sessione browser end-to-end completa**: la verifica browser è stata
saltata su richiesta dell'utente.

## RBAC/RLS e audit

La 014 resta la base e non vengono rimosse capability preesistenti. Admin conserva
la wildcard. Le modifiche richiedono `order.update`/`delivery_note.update`; i
collegamenti fattura richiedono anche `invoice.read`; i collegamenti documentali
richiedono `document.update` e visibilità del documento. La rimozione delle
attribuzioni quantitative richiede `invoice.update`. Upload e archiviazione
restano soggetti alle rispettive capability.

Le scritture dirette sulle tabelle commerciali sono revocate a `authenticated`
e `anon`: passano dalle RPC validate. Le policy di lettura delle relazioni
fattura richiedono anche accesso alle fatture. Le relazioni documentali verificano
`document_visible`. Audit presente su intestazioni, righe e tabelle di relazione;
i dettagli mostrano gli ultimi eventi autorizzati.

## Test e stato della verifica

Superati durante l'implementazione:

- `npm test`: 5 file di test, inclusi validazione commerciale e regressioni;
- `npm run typecheck`;
- `npm run lint`, dopo la correzione del caricamento asincrono delle opzioni;
- `bash scripts/test-sql.sh`: fasi precedenti, 1F.1B e upgrade legacy.

I nuovi test SQL verificano consegne parziali/complete/eccedenti, più DDT e righe,
ID stabili, riduzione e rimozione di righe referenziate, conflitto di versione,
compatibilità, multicommessa, relazioni con fatture, attribuzioni quantitative,
valute, documenti condivisi/versioni, archiviazione, livelli delle anomalie,
RBAC/RLS, wildcard admin e audit.

`npm run build` finale: superato, incluse compilazione, controllo TypeScript e
generazione delle route. Rimane l’avviso preesistente Next.js sulla convenzione
`middleware`, deprecata a favore di `proxy`.

La prova Playwright si è fermata prima di aprire il browser per la libreria
Chromium `libatk-1.0.so.0` mancante. L'utente ha richiesto di saltarla.
Gli script in `tests/e2e/` sono predisposti ma non risultano superati: usano
PostgreSQL/PostgREST reali locali e un adattatore Auth/Storage di test. Non
sostituiscono una verifica dell'infrastruttura Supabase Auth/Storage reale.

## Limiti residui

- Verifica browser completa non eseguita; usabilità e comportamento interattivo
  richiedono ancora una prova operativa.
- L'errore di integrità restituito alla UI è generico: indica dati incoerenti
  con record collegati; la motivazione SQL precisa è nei log server.
- Gli importi fatturati richiedono attribuzione esplicita; le quantità fatturate
  richiedono relazioni tra righe. Non vengono dedotti da descrizioni o PDF.
- Le attribuzioni delle righe possono essere rimosse e reinserite; non hanno un
  form dedicato di modifica. Un link d'intestazione con attribuzioni dipendenti
  non si scollega finché queste non vengono rimosse.
- Nessun cambio valuta, ripristino Ordini/DDT o centro anomalie generale.
- Nessuna applicazione della migrazione o collaudo sul Supabase remoto.
