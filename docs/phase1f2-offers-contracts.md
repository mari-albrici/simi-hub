# Fase 1F.2 — Offerte, preventivi e contratti

La migration `017_phase1f2_offers_contracts.sql` aggiunge il ciclo commerciale in modo additivo. Le offerte sono record applicativi con `offer_number` e `revision`; ogni revisione conserva righe, importi, stato e documento e solo una revisione per numero è corrente. Le righe usano sconto percentuale e la stessa aritmetica decimale del modulo fatture, con aliquota esplicita e segno preservato.

Le relazioni `offer_projects`, `offer_orders`, `contract_projects`, `contract_orders`, `contract_invoices`, `document_offers` e `document_contracts` sono many-to-many e mantengono navigazione senza duplicare dati. I contratti hanno tipologia estensibile, date, valore opzionale e stati separati da archiviazione. `contract.expires_at` alimenta una scadenza operativa collegata al contratto; aggiornamenti e archiviazione risincronizzano la riga derivata.

Le pagine `/offerte` e `/contratti` sono server-side con ricerca, filtro stato, paginazione API e azioni Nuovo, Modifica e Archivia. I dettagli mostrano righe, commesse, ordini/fatture e scadenze. Il fascicolo commessa espone Offerte e Contratti con creazione precompilata. Il caricamento file continua a usare il sistema documentale privato esistente; le relation table dedicate sono pronte per il workflow di upload.

Le capability `offer.*` e `contract.*` sono controllate sia dai page guard sia dalle RPC SECURITY DEFINER; la migration aggiorna anche la matrice server-side mantenendo wildcard admin. Non è stata eseguita alcuna migration remota.

Verifiche eseguite: `npm test`, `npm run typecheck`, `npm run lint`, `bash scripts/test-sql.sh` (incluse offerte con sconto, contratto multicommessa, scadenza derivata e relazioni operative). Le relazioni ordine/fattura e contratto/fattura sono state completate nella remediation della Fase 1G tramite azioni server-side compatibili.
