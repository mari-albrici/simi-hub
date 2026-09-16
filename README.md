# SIMI Hub

SIMI Hub è un portale amministrativo interno dedicato alla gestione delle commesse, documenti, fatture, clienti, fornitori, scadenze, personale e società del gruppo SIMI.

## Requisiti

- Node.js 20+
- npm
- account Supabase con progetto PostgreSQL

## Installazione

```bash
npm install
cp .env.example .env.local
```

## Configurazione Supabase

1. Creare un nuovo progetto Supabase.
2. Copiare le variabili di ambiente da .env.example a .env.local.
3. Inserire URL e anon key del progetto.
4. Generare la service role key solo lato server.

Variabili richieste:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Migrations e schema

Le migration SQL devono essere applicate tramite il terminale Supabase o il client SQL del progetto. Nella base del progetto è già presente una struttura pronta per la gestione di:

- profiles
- projects
- legal_entities
- companies
- document_categories
- documents
- invoices
- deadlines
- employees
- activity_logs

### Schema da implementare in Supabase

Per una prima versione MVP, le tabelle principali sono progettate con UUID, foreign key, trigger `updated_at`, RLS e policy di accesso.

## Bucket Storage

Creare un bucket privato chiamato `simi-documents`.

Configurazione consigliata:

- private bucket
- accesso tramite signed URLs
- nessun URL pubblico permanente

## Primo admin

Dopo il primo login, creare l'utente con email aziendale autorizzata, ad esempio `admin@simi.it`.

Il profilo `profiles` deve essere creato in modo coerente con `auth.users`, con ruolo `admin` e `active = true`.

## Avvio del server

```bash
npm run dev
```

Aprire: http://localhost:3000

## Struttura progetto

```text
src/
  app/
    (auth)
    (portal)
  lib/
    auth.ts
    constants.ts
    mock-data.ts
    validations.ts
  types/
```

## Ruoli e permessi

Ruoli previsti:

- admin
- administration
- management
- project_manager
- technical
- viewer

Permessi principali:

- project.read / create / update / delete
- document.read / upload / update / delete
- invoice.read / create / update / delete
- company.read / update
- employee.read / update
- admin.users / admin.settings

## Note di sicurezza

- nessuna chiave sensibile nel repository
- file `.env.local` non versionato
- RLS attivo lato database
- controllo server-side per domini email autorizzati
- input validato con Zod
- soft delete consigliato per entità amministrative critiche

## Dati di sviluppo

I dati iniziali sono fittizi e non rappresentano realtà aziendali reali. Il portale è pensato come base di partenza per un gestionale amministrativo interno.
