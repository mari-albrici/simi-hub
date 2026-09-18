# Fase 2A — Dipendenti, fascicolo HR e scadenze

| Area | Stato | Dettaglio |
|---|---|---|
| Anagrafica | Completata | Campi estesi per IT/FR/LUX, stato, assunzione e cessazione |
| Elenco | Completata | Ricerca, filtri società/stato, paginazione server-side |
| Fascicolo | Completata | Panoramica, dati contrattuali, documenti, scadenze e attività |
| Documenti HR | Completata | Riutilizza `documents`, `document_versions`, Storage privato, hash e versioni |
| Privacy | Completata | `employee.read` separato da `employee.hr.read`; RLS e Storage verificati |
| Scadenze | Completata | Vista `employee_deadlines` derivata da `documents.expiry_date` e scadenze manuali HR |
| Archiviazione | Completata | RPC reversibile e auditata; cessazione resta distinta dall'archiviazione |
| Formazione/onboarding | Rimandata | Nessun modulo 2A non richiesto implementato |

## Migration

È stata aggiunta `019_phase2a_employees_hr.sql`. Aggiunge i dati anagrafici, `archived_at`, categorie HR estensibili, RPC di collegamento documento-dipendente, archiviazione/ripristino e la vista `employee_deadlines`. `supabase/schema.sql` la include; va applicata manualmente sulle installazioni remote.

La relazione documentale continua a usare `documents.employee_id`, già FK verso `employees`: non esiste un secondo archivio file o una seconda relazione equivalente.

## Privacy e autorizzazioni

`employee.read` permette di vedere l'anagrafica. `employee.hr.read` è richiesto per leggere documenti con `employee_id` o classificazione HR, per ottenere versioni e signed URL, e per collegare/caricare un documento HR. HR e admin dispongono dell'accesso; gli altri profili possono essere autorizzati all'anagrafica senza accesso al file. Le policy RLS su `employees`, `documents`, `document_versions`, `deadlines` e Storage usano gli stessi controlli server-side.

## Workflow verificati

- Personale → nuovo dipendente → salvataggio → fascicolo.
- Fascicolo → modifica anagrafica.
- Fascicolo → upload documento con dipendente precompilato.
- Documenti HR con `expiry_date` → `employee_deadlines` e scadenziario.
- Cessazione conservata; archiviazione e ripristino reversibili.
- Audit di inserimento, modifica, documento e cambio stato tramite `activity_logs`.

## Test

Sono stati aggiunti `tests/sql/phase2a.sql` e l'upgrade della sequenza in `scripts/test-sql.sh`. Coprono accesso HR, privacy viewer, anagrafica francese, scadenza derivata, cessazione, archive/restore e audit. Eseguiti anche i test esistenti fino alla Fase 1G.

## Limitazioni residue

La configurazione dei documenti obbligatori per mansione/contratto/paese è predisposta dall'estensione del modello ma non è ancora un workflow configurabile; onboarding, offboarding, corsi, idoneità strutturate, presenze, ferie e paghe restano fuori dalla Fase 2A. La verifica browser autenticata dipende dall'ambiente Supabase disponibile; il percorso UI è coperto da route/server action e typecheck/lint/build checks.
