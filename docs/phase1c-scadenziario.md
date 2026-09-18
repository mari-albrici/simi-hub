# Fase 1C — Scadenziario operativo

## Struttura

La migration `009_phase1c_deadlines.sql` estende `deadlines` per le sole scadenze manuali con categoria, note e archiviazione. Riutilizza società, commesse, controparti, documenti, directory utenti, permessi `deadline.read`/`deadline.write` e audit esistenti. `deadline_categories` contiene categorie configurabili via database; l'interfaccia le legge dinamicamente.

Le scadenze finanziarie non vengono inserite in una tabella:

- `financial_deadline_balances`: una riga per rata; una riga per fattura solo se non esistono rate.
- `operational_deadlines`: proiezione comune di saldi finanziari e scadenze manuali, con stato temporale e relazioni.
- `deadline_financial_kpis()`: aggregati per pagamento/incasso, valuta e stato scaduto.

Le view sono `security_invoker`: rispettano RLS delle sorgenti. Anche la view preesistente `invoice_financial_summary` viene corretta per usare questa modalità. Le scadenze collegate a documenti privati sono soggette a una policy restrittiva aggiuntiva.

Le chiavi `installment:<uuid>`, `invoice:<uuid>` e `manual:<uuid>` sono stabili. Le relazioni multicommessa vengono aggregate in un array, senza moltiplicare gli importi. Modifiche di data, allocazioni e archiviazione dei movimenti sono visibili alla lettura successiva. Nessun job di sincronizzazione.

## Saldi e stato

Le allocazioni esplicite a una rata vengono conteggiate per prime. Le allocazioni alla sola fattura si distribuiscono virtualmente sul residuo delle rate, ordinate per data, posizione e ID. Il calcolo non modifica le allocazioni registrate. Movimenti archiviati esclusi. I vecchi flag manuali `paid` non sostituiscono i movimenti contabili.

Una rata con residuo zero è completata anche se la data è passata; una rata parzialmente saldata con data passata è scaduta. `Prossima` indica entro sette giorni; le finestre 7/30 giorni includono oggi e il giorno limite ed escludono completate e scadute. Priorità e stato temporale restano distinti.

Fatture archiviate, annullate e note di credito sono escluse dalla proiezione finanziaria. Fatture senza rate e senza data rimangono nell'elenco generale come “Senza data” e nei KPI aperti, ma non nel calendario. Valute diverse rimangono separate nei KPI; nessuna conversione implicita.

## Interfaccia

`/scadenze`: ricerca, filtri combinabili, finestre temporali, elenco da 50 righe per pagina, calendario mensile e Le mie scadenze. Il calendario legge tutte le pagine del mese filtrato, senza troncare alla soglia API. Creazione, modifica, completamento e archiviazione manuali sono riservati ai permessi di scrittura. L'archiviazione richiede conferma e conserva il record.

I cinque KPI richiesti e il widget Prossime scadenze leggono la nuova fonte. Layout e altri widget della dashboard restano quelli esistenti. Anche il dettaglio rate della fattura legge gli stessi saldi. I conteggi finanziari dei KPI rappresentano scadenze/rate, non fatture distinte.

## Correzione necessaria della Fase 1B

I test con pagamenti reali hanno rilevato un identificatore ambiguo nella RPC `save_financial_movement`. La migration 009 sostituisce la funzione aggiungendo un'etichetta di blocco e qualificando la cancellazione delle vecchie allocazioni. La firma e il comportamento autorizzativo restano invariati.

## Verifiche

- `npm test`: validazioni di scadenze, date, orari, responsabilità, filtri e paginazione, oltre alla suite esistente.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `bash scripts/test-sql.sh`: PostgreSQL 17 temporaneo, schema nuovo e upgrade con dati legacy; casi in `tests/sql/phase1c.sql` per stati, residui, rate multiple, allocazioni esplicite e generiche, incassi, pagamenti, multicommessa, CRUD manuale, audit, RLS/RBAC, KPI, modifiche delle fonti e unicità.
- Build eseguita fuori dal sandbox: nel sandbox Next compilava ma non riusciva a leggere l'output del subprocess TypeScript.

## Operazioni Supabase, da eseguire manualmente

1. Verificare che le migration 001–008 siano già applicate; eseguire il consueto backup.
2. Revisionare e applicare soltanto `009_phase1c_deadlines.sql` tramite il processo amministrativo di migration. Richiede PostgreSQL 15+ per le view security-invoker (testato su 17).
3. Ricontrollare eventuali record legacy `deadlines.invoice_id IS NOT NULL`: sono conservati, ma esclusi dal nuovo registro per non duplicare la fonte finanziaria. Eventuali promemoria indipendenti vanno riclassificati manualmente dopo verifica.
4. Completare eventuali società mancanti nelle scadenze manuali legacy e controllare vecchi stati/priorità non standard. I nuovi salvataggi richiedono società, priorità e stato validi.
5. Verificare eventuali vecchi flag “pagata” senza movimenti: il saldo autorevole proviene dalle allocazioni. Non vengono inventati pagamenti di migrazione.
6. Distribuire l'applicazione dopo la migration e verificare con utenti dei ruoli amministrazione, sola lettura e tecnico.

Nessuna migration è stata applicata al Supabase remoto; nessun `supabase db push` eseguito.

## Limiti intenzionali

Nessun generatore per documenti, contratti, dipendenti o altri moduli futuri; potranno estendere la proiezione mantenendo una chiave stabile per sorgente. Nessuna UI di amministrazione delle categorie in questa fase. Il calendario mostra tutti gli eventi del mese; per mesi eccezionalmente densi conviene usare l'elenco paginato. Non è stata eseguita una verifica browser con dati Supabase remoti. Le incongruenze già presenti fra totale fattura e somma rate richiedono correzione della fonte: lo scadenziario non inventa rate compensative.
