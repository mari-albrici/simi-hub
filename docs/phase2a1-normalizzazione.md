# Fase 2A.1 — normalizzazione trasversale

## Stati

È stato introdotto `src/lib/status.ts`, con label italiane e variante Bootstrap per dominio (`invoice`, `payment`, `document`, `deadline`, `project`, `order`, `delivery_note`, `offer`, `contract`, `employee`). `StatusBadge` usa questo registro; le form commerciali e fatture usano le stesse label nei select. Le pagine principali di fatture, commesse, ordini/DDT, offerte, contratti, documenti e fascicolo dipendente non mostrano più il valore tecnico quando presentano lo stato.

## Documenti module-owned

La migration 020 crea `general_document_register`, vista derivata dal registro documentale centrale. Esclude i documenti collegati a fatture (`invoices.document_id` e `document_invoices`), ordini (`document_orders`) e DDT (`document_delivery_notes`). I record restano in `documents`, `document_versions` e Storage privato: cambiano solo ownership semantica e query dell'archivio generale.

Le fatture espongono il documento e il PDF direttamente nel dettaglio e hanno upload contestuale con categoria 07. Ordini e DDT continuano a usare `CommercialDocuments`, con upload contestuale e categorie 01/06. Le versioni, hash, signed URL, audit e RLS restano quelli esistenti.

## Legal entity

La migration 020 aggiunge `legal_entities.entity_key`, determina l'entity italiana canonica in modo deterministico, migra le FK di commesse, documenti, fatture, dipendenti, ordini, DDT, offerte, contratti, conti, movimenti e scadenze, disattiva il duplicato senza cancellarlo e crea una chiave unica attiva. Il nome viene normalizzato a `SIMI S.r.l.` per i record chiaramente denominati SIMI Italia; denominazioni legali esistenti differenti vengono conservate. Il trigger `normalize_legal_entity_key` impedisce nuovi duplicati attivi IT/FR/LUX. Le query applicative dei dropdown filtrano `active=true`.

## Test e limitazioni

`tests/sql/phase2a1.sql` verifica merge, FK/label, prevenzione duplicati e vista generale; la suite SQL completa mantiene i test precedenti e l'upgrade legacy. `npm test`, typecheck, lint e diff check passano. `npm run build` compila l'app ma il runner Next fallisce ancora nella fase TypeScript con `Could not parse output from TypeScript's --showConfig`, problema già presente nella Fase 1G; `npm run typecheck` passa.

La verifica UI autenticata browser non è stata eseguita contro un Supabase remoto. Applicare manualmente la migration 020; non eseguire `supabase db push` tramite questo lavoro.
