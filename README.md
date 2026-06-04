# STD TOVER

Pagina web statica per consultare le schede tecniche STD Tover.

L'app indicizza i PDF locali e permette di cercare prodotti per categoria, consultare i dati tecnici, visualizzare foto prodotto, prezzi da listino e fare domande su utilizzo, resa, posa, preparazione, tempi, modalita di impiego e prezzi. Le risposte sono limitate ai dati presenti nelle schede e nel listino indicizzati.

## Pubblicazione GitHub Pages

Questa cartella e pronta per essere pubblicata come sito statico GitHub Pages.

Impostazioni consigliate:

- Repository name: `STD-TOVER`
- GitHub Pages source: GitHub Actions
- Branch principale: `main`

La workflow inclusa pubblica automaticamente il contenuto della root del repository.

## Rigenerare i dati

Se cambiano i PDF nella cartella `/Users/michele/Desktop/STD`, rigenerare il dataset tecnico con:

```bash
python3 scripts/extract_std.py
```

Se cambia il listino prezzi o si vogliono aggiornare le foto prodotto, rigenerare gli extra con:

```bash
python3 scripts/enrich_catalog.py
```
