# Fase A — Affidabilità operativa

## Fonti e decisioni

La verifica è riferita al codice e a PostgreSQL/PostgREST locali con RLS reale. Non è stata applicata alcuna modifica al database operativo né verificata la qualità dei dati di produzione.

Catena finanziaria esistente, conservata:

`invoices → invoice_installments → financial_allocations + financial_movements non archiviati → invoice_financial_summary / financial_deadline_balances → operational_deadlines`.

- `financial_deadline_balances` distribuisce una sola volta le allocazioni senza rata sulle rate in ordine di data/posizione/ID; le allocazioni specifiche incidono sulla rata indicata.
- La scadenza di testata è un fallback solo quando non esistono rate.
- Lo stato nominale della fattura e il vecchio flag `paid` della rata non sostituiscono i movimenti finanziari.
- La vista `operational_deadlines` mantiene RLS/security invoker. Aggrega esposizioni, scadenze manuali e documentali; i contratti utilizzano il collegamento/sincronizzazione già esistente e i documenti HR conservano le restrizioni di accesso.
- Le attività rimangono lavoro umano, anche quando hanno una data: non vengono trasformate in nuove righe dello scadenziario. Nessuna duplicazione fisica.
- `deadline_financial_kpis()` già aggrega i residui della stessa vista per valuta. Non richiede modifiche; i nuovi aggregati applicativi sono verificati rispetto alla stessa fonte. Non viene implementata una seconda formula di saldo.

## A1 — Dashboard finanziaria

Prima: i KPI usavano residui, ma grafico, situazione clienti/fornitori e segnalazioni commessa utilizzavano totali/stati/date delle fatture o tabelle scadenze/documenti separate.

Ora: `getDeadlines({status:'open'}, true)` fornisce le righe autorizzate; `summarizeDeadlineFinance` aggrega i residui già calcolati in SQL. Nessuna ricostruzione del pagato a partire dagli stati.

- KPI Da pagare/Da incassare e scaduto: importi separati per valuta, conteggio di posizioni/rate, non di fornitori unici.
- Cash flow e riepiloghi clienti/fornitori: solo EUR, dichiarato nell'interfaccia; avviso se sono presenti altre valute. Nessuna API cambi.
- Fasce del grafico: scaduto, oggi–30, 31–60, 61–90 giorni. I totali intitolati “prossimi 90 giorni” escludono lo scaduto.
- Posizioni senza data: restano nell'esposizione, escluse dalla previsione temporale con avviso esplicito.
- Pagamenti/incassi registrati: movimenti effettivi non archiviati, EUR, tutte le date, inclusi importi non ancora allocati. Non sono un saldo bancario né soltanto movimenti relativi alle posizioni aperte.
- Somme monetarie applicative in centesimi, coerenti con gli helper esistenti.

## A2 — Attenzione operativa

Rimosso il totale che sommava anomalie e scadenze chiamandole attività.

| Indicatore | Criterio | Destinazione |
|---|---|---|
| Le mie attività aperte | Assegnate all'utente, todo/in_progress, non archiviate, RLS | `/attivita?view=mine` |
| Anomalie aperte | Stato open dopo sincronizzazione, RLS | `/anomalie?view=open` |
| Scadenze oggi / entro 7 giorni | Non completate, non archiviate, data tra oggi e oggi+7 | `/scadenze?period=7` |
| Scadenze scadute | Stato temporale overdue, non archiviate | `/scadenze?period=overdue` |

Le query di attività/anomalie accettano una modalità solo conteggio (`head:true`) e condividono tutti i filtri con gli elenchi. Le anteprime restano limitate, ma non vengono usate per i conteggi complessivi. Pagamenti e incassi scaduti hanno link separati con `kind` e `status=overdue`.

## A3 — Scadenze e report

Fonte logica: `operational_deadlines`, attraverso `getDeadlines`.

- Uniformati conteggi dashboard, anteprima dei prossimi 30 giorni, segnalazioni di scadenza nelle commesse della dashboard e conteggio Report.
- Report: importi nominali separati tra acquisti/vendite e per valuta, dichiarati come totali dei documenti non archiviati (incluse rettifiche negative), non esposizione residua.
- Report Scadenze aperte collega `/scadenze?status=open` e usa lo stesso filtro.

Convenzioni esistenti conservate: date applicative ISO UTC, SQL `CURRENT_DATE` nel database configurato UTC. Scaduta = data < oggi e non completata; oggi = data odierna; prossima = dopo oggi ed entro 7 giorni; futura = oltre 7 giorni. La vista tratta anche una data assente come futura, ma la dashboard la segnala separatamente e non la colloca nel grafico. La finestra “entro 7 giorni” include oggi. Finestre 30/90 giorni sono esplicitamente etichettate, non ridefiniscono “prossima”.

## A4 — Personale

Confermato il limite SQL di 50 record senza controlli UI. Riutilizzati `WorkPagination` e `pageNumber` esistenti:

- 50 record per pagina, conteggio esatto autorizzato;
- precedente/successiva e totale risultati/pagina;
- ricerca, stato, società, paese e parametro archiviati preservati nella query string;
- ordinamento stabile cognome, nome, ID;
- pagina non valida normalizzata a 1;
- nessun caricamento dell'intero archivio nel browser.

## Elenchi — rilevazione per Fase B

| Modulo | Paginazione | Ricerca | Filtri | Ordinamento | Lettura server-side / problemi |
|---|---|---|---|---|---|
| Fatture | Assente in UI; readAll a blocchi | Numero fattura/progressivo eSolver, SQL | Tipo, stato, società, controparte/commessa via URL, date; finanziario dopo lettura | ID fisso, non selezionabile | Sì; carica tutti i risultati, riepiloghi finanziari da verificare con grandi volumi |
| Documenti | 50, server | Testo del registro, SQL | Categoria, stato, società, paese, collegamenti, date/scadenza | Selezionabile, asc/desc e ID stabile | Sì; liste di opzioni complete da monitorare con molti dati |
| Commesse | 50, server | Codice, nome, città, cliente | Società, paese, cliente, referente, stato; altri parametri previsti dalla query | Codice fisso | Sì; nessun ordinamento selezionabile, caricamento delle opzioni da monitorare |
| Clienti | Assente | Nome/P.IVA/eSolver dopo lettura | Stato, paese, città | ID fisso | Sì, ma filtra in memoria sul server dopo aver caricato anagrafiche e contatti |
| Fornitori | Assente | Come clienti | Come clienti | ID fisso | Come clienti |
| Personale | 50, server, navigabile | Nome/cognome, matricola, mansione | Stato, società, paese, archiviati | Cognome/nome/ID fisso | Sì; corretta navigazione. Ricerca con punteggiatura speciale da approfondire in Fase B |

Nessun refactoring degli altri elenchi eseguito.

## Migration

Nessuna migration per Fase A: le viste, le RPC, gli indici e i permessi necessari esistono già. Nessuna operazione manuale aggiuntiva richiesta su Supabase per questa fase.

## Limiti e decisioni funzionali aperte

- Nessuna conversione valutaria storicizzata: la previsione rimane EUR; altre valute sono visibili nei KPI separati.
- Documenti negativi/note di credito: conservata l'esclusione dall'esposizione positiva della vista centrale; non inventata una compensazione con fatture originali. Una compensazione automatica richiede regole e relazioni esplicite.
- Dati legacy con stato “pagata” senza movimenti: non vengono trattati come pagamento provato. Serve eventualmente riconciliare/importare lo storico.
- Il modello attuale non documenta una conversione per allocazioni tra valute diverse. Tali registrazioni o rate legacy incoerenti richiedono riconciliazione: nessuna correzione o conversione automatica in questa fase.
- Le somme nominali del Report non sono ricavi/costi per competenza, margine o saldo di cassa.
- Tutti i conteggi dipendono dai permessi e dall'istante di lettura; modifiche concorrenti tra dashboard e click possono legittimamente cambiare il risultato.
