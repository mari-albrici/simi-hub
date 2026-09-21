# Fase 2A.5A — shell e stabilizzazione UX

## Stato iniziale e test

Il workspace conteneva già modifiche non committate della 2A.4 e della 2A.5A. All'inizio di questa verifica `ui-redesign.test.cjs` era già verde: il fallimento storico segnalato non era riproducibile e non è possibile attribuirgli una causa certa senza il log originale. Esecuzione diretta del file, oltre a `npm test`, per verificare che tutti i singoli casi siano effettivamente eseguiti. Nessuna asserzione rimossa o disabilitata.

Regressioni riprodotte nel browser e corrette:

- La regola `.table td:nth-child(n+1)` prevaleva sulla larghezza delle descrizioni, spingendo le azioni oltre il bordo. Limitata alle tabelle non amministrative; descrizioni più corte fra 992 e 1399 px.
- Il vecchio menu `details` con posizione assoluta viveva dentro lo scroll della tabella. `RowActionsMenu` usa ora un pulsante con Bootstrap Icon e un popover nativo nel top layer, posizionato rispetto al pulsante e vincolato alla viewport.
- Elementi `visually-hidden` assoluti potevano estendere lo scroll della pagina mobile: il contenitore `table-responsive` è ora anche il loro riferimento di posizionamento.
- `allowedDevOrigins` usava host con porta, incompatibili con la documentazione della versione Next installata; ora usa hostname. Le origini delle server action restano separate.
- Nel test browser dei filtri, l'asserzione immediata precedeva l'aggiornamento React: il test aspetta ora visibilità/nascondimento del pannello reale.

## Navigazione e responsive

Dashboard, Commesse, Contabilità (Ordini, DDT, Fatture, Pagamenti / Incassi), Documenti, Anagrafiche (Clienti, Fornitori, Società SIMI), Scadenze, Personale, Report, Impostazioni. La visibilità continua a rispettare i permessi. Offerte e Contratti mantengono URL, fascicolo commessa e collegamenti contestuali.

Route attiva: corrispondenza esatta oppure prefisso seguito da `/`; il gruppo del percorso corrente parte aperto. Gruppi collassabili con pulsanti e `aria-expanded`/`aria-controls`.

Sidebar desktop: 260 px, flex non comprimibile, scroll proprio, main con `min-width: 0`. Sotto 992 px: offcanvas Bootstrap, apertura esplicita, chiusura su selezione, cambio route, ESC, backdrop, pulsante e passaggio a desktop. Tabelle con scorrimento orizzontale confinato; importi, date e stati non si spezzano.

Primary: token esistente `--simi-primary: #253a78`; variante scura `#1c2c5c`. Override semantici Bootstrap per pulsanti, link, selezione, checkbox, paginazione e focus. Bianco sul primary ha contrasto circa 10.7:1. Colori success/warning/danger/info mantenuti.

Toolbar condivisa per Fatture, Scadenze, Documenti, Ordini, DDT, Offerte, Contratti, Commesse, Clienti, Fornitori, Pagamenti, Personale. Filtri secondari chiusi inizialmente, valori attivi conservati e indicati dal contatore.

## Audit loading

- Navigazioni, breadcrumb, link contestuali, creazione, modifica, reset e paginazione: `AppLink` con `useLinkStatus`; feedback discreto nella shell, fallback di segmento durante il rendering.
- Filtri GET: `FilterForm`, transizione router con `aria-busy` e stato locale immediato.
- Form server action, creazione/modifica, archiviazione/ripristino e link/unlink: `SubmitButton`/`ConfirmSubmitButton`, pending e prevenzione del doppio submit. Test AST controlla tutti i form con action.
- Upload/riuso/versione: `useActionState`, pulsanti disabilitati e messaggio di caricamento; estrazione fatture: transizione locale già presente.
- PDF modale: caricamento iframe e retry esistenti. Anteprima nel dettaglio: aggiunto `DocumentPreview` con feedback.
- Apri/Scarica: `FileLink` mostra preparazione durante la firma, con gestione errore; stesso endpoint protetto e stessa verifica `signedDocumentVersion`. Risposta JSON opzionale privata/no-store; redirect tradizionale conservato.
- Pulizia query dei toast: History API, evitando una navigazione dati inutile; hash conservato.
- Nessun `router.refresh` presente. Il form reset password è già disabilitato e non avvia operazioni: non è stato implementato in questa tranche.

## eSolver e database

Nessun campo equivalente preesistente su `companies`; il numero di registrazione eSolver delle fatture ha un significato diverso. `companies.esolver_code`: testo opzionale, zeri iniziali conservati, nessuna unicità. Form di creazione/modifica, dettaglio, ricerca e informazione secondaria sotto il nome nelle due liste. Usa le mutation e le policy esistenti.

Migration additiva `021_phase2a5_company_esolver.sql`, inclusa in `supabase/schema.sql`; nessuna migration precedente modificata e nessuna applicazione remota. Test SQL per modifica, null, duplicati e preservazione del codice. Upgrade locale esteso alla 021.

## Riproduzione verifiche browser

Solo database usa e getta. Avviare `scripts/start-cycle-e2e.sh`, quindi `tests/e2e/local-services.cjs`. Caricare nell'ordine `fixture.sql` (già nel setup), `redesign-fixture.sql`, `app-shell-fixture.sql`. Avviare Next sulla porta 3100 con URL Supabase locale 55430 e chiave locale di test. Playwright è installato fuori dal progetto, in `/tmp/simi-ui-tools`.

- `node tests/e2e/redesign.cjs`: tabelle e dettagli, 1440/1280 px.
- `node tests/e2e/app-shell.cjs`: 1440/1920 e 375/768 px, gruppi, route figlie, chiusure mobile, overflow, icone/menu, filtri, pending, salvataggio e ricerca eSolver.

Le fixture non fanno parte dei dati operativi. Nel presente ambiente è stato necessario avviare PostgREST sulla rete host perché il traffico tra container bridge era bloccato.

Esclusi 2A.5B/C/D e 2B; nessun profilo completo, preferiti, dashboard personalizzabile o ridisegno globale dei document link.

## Esito finale

Verdi: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `bash scripts/test-sql.sh`, `git diff --check`. Esecuzione diretta di `ui-redesign.test.cjs`: 12 casi passati. Entrambe le suite Playwright (`redesign.cjs`, `app-shell.cjs`) completate con exit 0, incluso salvataggio eSolver e feedback su richieste trattenute e rilasciate dal test.

Il problema esterno `--showConfig` non si è ripresentato. Rimane l'avviso preesistente Next sulla convenzione middleware deprecata; non impedisce la build. La causa del fallimento storico del test unitario resta non attribuibile dal workspace ricevuto, dove era già verde. Nessun problema funzionale bloccante emerso nelle verifiche finali. Per rendere persistente il nuovo campo sull'ambiente operativo occorrerà distribuire la migration 021, non applicata in questa attività.
