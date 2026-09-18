# Fase 2A.2 — UI/UX e PDF

La revisione introduce token visuali condivisi in `globals.css`, riduce ombre e contenitori superflui e uniforma controlli, tabelle e pannelli amministrativi.

## Documento

Il dettaglio `/documenti/[id]` presenta prima il PDF corrente in un viewer ampio, seguito dalla sezione `Dati` con soli valori compilati e dalla sezione secondaria `Versioni precedenti`. Gli eventi audit non sono mostrati nella pagina, ma restano conservati e gestiti dal backend.

## PDF operativi

`PdfPreviewModal` è condiviso da fatture, ordini e DDT. Il viewer usa gli endpoint firmati già esistenti, quindi Storage privato, RLS e RBAC restano invariati. La modalità mostra esclusivamente file, nome, download, apertura in nuova scheda e chiusura; non reindirizza all'archivio documentale.

## Verifica

I test strutturali verificano la presenza del viewer, l'assenza degli eventi nel dettaglio Documento e l'assenza dei link operativi verso `/documenti/[id]`. Il build compila il codice ma continua a terminare con l'errore esterno già noto `Could not parse output from TypeScript's --showConfig`; typecheck, lint, test SQL e `git diff --check` restano superati.
