# Hotfix fatture — eSolver, commesse, sconti e valori negativi

Il modulo fatture esistente è stato corretto senza introdurre un secondo
workflow e senza iniziare la Fase 1F.2.

## Cause individuate

- Le commesse selezionate erano mantenute nello stato React, ma le checkbox non
  avevano un campo inviato al `FormData`. `form.getAll("project_ids")` riceveva
  quindi un array vuoto e la RPC cancellava correttamente le relazioni. Il form
  ora invia un hidden input per ogni commessa selezionata.
- `invoice_lines.discount` era già modellato come percentuale (`0..100`) e
  mostrato come “Sconto %”, ma `InvoiceForm.computeLine` ignorava il campo e la
  RPC `save_invoice` calcolava `quantity * unit_price`. Ora UI, Zod, RPC e
  calcolo condiviso applicano `lordo * (1 - percentuale / 100)`.
- I negativi venivano bloccati da `min(0)`/`positive()` nella UI e Zod, da
  `net<0`, `vat<0`, `total<0`, `qty<=0`, `price<0` e rate positive nella RPC,
  oltre a importi finanziari non firmati. Il workflow fatture ora conserva il
  segno e verifica solo limiti, decimali e coerenza matematica.

## Migration 016

`supabase/migrations/016_invoice_hotfix.sql` aggiunge:

- `invoices.esolver_registration_number text`, opzionale, indicizzato e senza
  unicità;
- validazione dello sconto percentuale `-100..100`;
- nuova versione autorevole di `save_invoice` e `save_invoice_phase1`;
- persistenza di `unit`, `discount` e `notes` anche sulle righe nuove;
- supporto a quantità, prezzi, imponibili, IVA, totali e rate negativi;
- protezione del cambio a rettifica negativa quando esistono pagamenti attivi;
- lock transazionale durante il salvataggio.

Le migration precedenti non sono state riscritte. `supabase/schema.sql` include
la 016. Nulla è stato applicato al Supabase remoto e non è stato eseguito
`supabase db push`.

## UI e ricerca

Il campo “Prog. eSolver” è disponibile in creazione e modifica, viene mostrato
nel dettaglio e nella tabella fatture ed è ricercabile con un filtro dedicato.
Non viene generato automaticamente.

La selezione di una o più commesse viene inviata al server, salvata in
`invoice_projects`, ricaricata dal dettaglio e resa visibile nel fascicolo della
commessa. Sostituzione, rimozione e assenza di commesse restano supportate.
L’attribuzione `invoice_lines.project_id` deve appartenere alle commesse header;
non viene sovrascritta dal salvataggio delle relazioni header-level.

## Calcoli e parser

`src/lib/invoice-calculations.ts` usa aritmetica intera scalata per centesimi e
decimali, con arrotondamento coerente con PostgreSQL `numeric`. Lo sconto è
percentuale; uno sconto negativo rappresenta una maggiorazione coerente col
modello.

Il form usa lo stesso calcolo per imponibile, IVA e totale. Sono stati rimossi i
limiti HTML che impedivano gli importi negativi. `parseMonetaryAmount` e
`parsePdfAmount` conservano il segno e accettano `-1.234,56`, `-1 234,56`,
`-1,234.56` e `(1.234,56)`. Il parser PDF condivide il parser deterministico e
riconosce anche `TVA`, `HT` e `TTC` nei label supportati.

## Test eseguiti

- `npm test` — superato, inclusi test regressione sconti, segni e form;
- `npm run typecheck` — superato;
- `npm run lint` — superato;
- `npm run build` — superato;
- `bash scripts/test-sql.sh` — superato, incluse migration 016 e fixture
  `tests/sql/invoice-hotfix.sql`.

La fixture SQL verifica progressivo eSolver, una/due commesse, sostituzione e
rimozione, relazione riga-commessa, sconto 10% con IVA 22%, quantità negativa,
imponibile/IVA/totale negativi, rate negative e reload dal database.

## Limitazioni

- La verifica browser interattiva non è stata eseguita in questa sessione; i
  percorsi server, form, validazione e SQL sono coperti dai test disponibili.
- Pagamenti/incassi restano operazioni positive: il supporto ai negativi riguarda
  fatture, righe, rate e parsing, non storni finanziari automatici.
- Le fatture storiche con sconti non vengono riscritte automaticamente; vengono
  ricalcolate secondo la nuova semantica al successivo salvataggio.
- Non è stato creato un modulo separato per note di credito.
