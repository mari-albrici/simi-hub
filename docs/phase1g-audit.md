# Fase 1G — Audit operativo end-to-end

Audit eseguito sulle migration 001–018, navigazione, RBAC/RLS, workflow documentale, commesse, fatture, ordini, DDT, offerte e contratti.

| Area | Problema | Gravità | Tipo | Correzione | Stato |
|---|---|---:|---|---|---|
| Offerte/ordini | `offer_orders` esisteva senza azione UI | High | Functional | RPC `set_offer_order` e componenti di collegamento nei dettagli | Corretto |
| Contratti/ordini | `contract_orders` esisteva senza azione UI | High | Functional | RPC `set_contract_order` e UI collega/scollega | Corretto |
| Contratti/fatture | `contract_invoices` esisteva senza azione UI | High | Functional | RPC `set_contract_invoice` e UI collega/scollega | Corretto |
| Documenti | I dettagli offerta/contratto non mostravano i documenti collegati | High | UX | Elenco navigabile e azione Carica documento con categoria predefinita | Corretto |
| Upload | Il workflow upload non propagava contesto offerta/contratto | High | Functional | Collegamento server-side tramite nuove RPC documentali | Corretto |
| Commessa | Le sezioni Offerte/Contratti non erano parte del dettaglio operativo | Medium | UX | Sezione contestuale con azioni Nuovo precompilate | Corretto |
| Navigazione | Menu mobile usava un carattere testuale per l’azione menu | Low | Accessibility | Bootstrap Icon `bi-list` con testo accessibile | Corretto |
| Build | Next 16 non riesce a parsare `tsc --showConfig` durante `next build` | High | Build | Riprodotto anche con `next build --webpack`; typecheck diretto passa | Aperto, problema toolchain |

## Workflow verificati

- Cliente: offerta con revisione e sconto → commessa tramite fascicolo → ordine/DDT tramite workflow esistente → fattura e incasso già coperti dai test SQL/applicativi.
- Fornitore: ordine → DDT → fattura → progressivo eSolver → pagamento; relazioni e quantità sono coperte dalle fixture 1F.1B e invoice hotfix.
- Documentale: upload, hash duplicati, versioni, signed URL, contesti commessa/controparte e archiviazione/ripristino sono coperti dai test Fase 1D; ora offerte e contratti usano le stesse relation table e lo stesso upload.

## Problemi rimasti

- La build non raggiunge exit code 0 per l’errore di parsing interno di Next sul risultato di `tsc --showConfig`; `npx tsc --showConfig --pretty false` produce JSON valido e `npm run typecheck` passa. Il problema è riproducibile anche con il builder webpack e non deriva da errori TypeScript applicativi.
- Non è stata introdotta una nuova dashboard o un centro anomalie: la fase richiedeva consolidamento, non nuovi moduli.
- Non è stata eseguita una sessione browser autenticata; la raggiungibilità è stata verificata con route, source assertions e server actions.

## Sicurezza e dati

Le nuove azioni usano RPC `SECURITY DEFINER`, capability dedicate, record non archiviati e RLS esistente. Non sono stati introdotti bypass email, accessi pubblici Storage, hard delete o dati mock. Le relazioni restano strutturate e le valute non vengono confrontate impropriamente.

## Verifiche

- `npm test` ✅
- `npm run typecheck` ✅
- `npm run lint` ✅
- `bash scripts/test-sql.sh` ✅, incluse fixture relazioni 1F.2 e upgrade 018
- `git diff --check` ✅
- `npm run build` ⚠ compilazione completata, errore esterno Next/TypeScript `Could not parse output from TypeScript's --showConfig`

Migration da applicare manualmente: `018_phase1g_relation_actions.sql`. Nessuna migration è stata applicata al remoto e non è stato eseguito `supabase db push`.
