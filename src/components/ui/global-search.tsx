"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "@/components/ui/app-link";
import type { GlobalSearchResult } from "@/lib/global-search";

const ICONS: Record<GlobalSearchResult["type"], string> = {
  project: "bi-folder2-open",
  company: "bi-building",
  invoice: "bi-receipt",
  document: "bi-file-earmark-text",
  employee: "bi-person",
};

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * Ctrl + K / Cmd + K
   *
   * Nel layout esistono due istanze di GlobalSearch:
   * una desktop e una mobile.
   * Attiviamo la scorciatoia soltanto sull'istanza
   * effettivamente visibile.
   */
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return;
      }

      const input = inputRef.current;

      if (!input || input.offsetParent === null) {
        return;
      }

      event.preventDefault();

      input.focus();

      if (query.trim().length >= MIN_QUERY_LENGTH) {
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [query]);

  /*
   * Chiude il pannello cliccando fuori
   * dalla ricerca.
   */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /*
   * Ricerca live con debounce.
   */
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      setOpen(false);
      return;
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Ricerca non disponibile");
        }

        const data = (await response.json()) as {
          results?: GlobalSearchResult[];
        };

        if (controller.signal.aborted) {
          return;
        }

        setResults(data.results ?? []);
        setOpen(true);
      } catch (err) {
        if (
          err instanceof DOMException &&
          err.name === "AbortError"
        ) {
          return;
        }

        console.error("Errore ricerca globale:", err);

        setResults([]);
        setError("Errore durante la ricerca.");
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  /*
   * Raggruppa i risultati per modulo.
   */
  const groupedResults = useMemo(() => {
    const groups = new Map<string, GlobalSearchResult[]>();

    for (const result of results) {
      const current = groups.get(result.section) ?? [];

      current.push(result);
      groups.set(result.section, current);
    }

    return Array.from(groups.entries());
  }, [results]);

  function closeSearch() {
    setOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setOpen(false);
    setError(null);
    setLoading(false);

    inputRef.current?.focus();
  }

  function handleInputChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const value = event.target.value;

    setQuery(value);

    if (value.trim().length >= MIN_QUERY_LENGTH) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function handleInputFocus() {
    if (query.trim().length >= MIN_QUERY_LENGTH) {
      setOpen(true);
    }
  }

  function handleInputKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="position-relative w-100"
    >
      <div className="input-group">
        <span className="input-group-text bg-body border-end-0">
          <i
            className="bi bi-search"
            aria-hidden="true"
          />
        </span>

        <input
          ref={inputRef}
          type="search"
          className="form-control border-start-0 border-end-0"
          placeholder="Cerca in SIMI Hub..."
          aria-label="Ricerca globale"
          aria-expanded={open}
          aria-haspopup="listbox"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          onChange={handleInputChange}
        />

        {loading ? (
          <span className="input-group-text bg-body border-start-0">
            <span
              className="spinner-border spinner-border-sm"
              role="status"
              aria-label="Ricerca in corso"
            />
          </span>
        ) : query ? (
          <button
            type="button"
            className="btn btn-outline-secondary border-start-0"
            aria-label="Cancella ricerca"
            onClick={clearSearch}
          >
            <i
              className="bi bi-x-lg"
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="input-group-text bg-body border-start-0 text-muted small">
            Ctrl K
          </span>
        )}
      </div>

      {open && query.trim().length >= MIN_QUERY_LENGTH && (
        <div
          className="position-absolute start-0 end-0 mt-2 bg-body border rounded shadow-lg overflow-auto"
          role="listbox"
          aria-label="Risultati ricerca globale"
          style={{
            zIndex: 1085,
            maxHeight: "480px",
            minWidth: "300px",
          }}
        >
          {loading && results.length === 0 ? (
            <div className="p-4 text-center text-muted">
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              />

              Ricerca…
            </div>
          ) : error ? (
            <div className="p-3 text-danger small">
              <i
                className="bi bi-exclamation-circle me-2"
                aria-hidden="true"
              />

              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-muted">
              <i
                className="bi bi-search d-block fs-4 mb-2"
                aria-hidden="true"
              />

              Nessun risultato per “{query.trim()}”.
            </div>
          ) : (
            <div className="py-2">
              {groupedResults.map(([section, items]) => (
                <div
                  key={section}
                  className="mb-2"
                >
                  <div className="px-3 py-2 small fw-semibold text-uppercase text-muted">
                    {section}
                  </div>

                  {items.map((result) => (
                    <Link
                      key={`${result.type}-${result.id}`}
                      href={result.href}
                      className="d-flex align-items-start gap-3 px-3 py-2 text-decoration-none text-body"
                      role="option"
                      onClick={closeSearch}
                    >
                      <div
                        className="d-flex align-items-center justify-content-center rounded bg-body-secondary flex-shrink-0"
                        style={{
                          width: 36,
                          height: 36,
                        }}
                      >
                        <i
                          className={`bi ${ICONS[result.type]}`}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="flex-grow-1 overflow-hidden">
                        <div className="d-flex align-items-center gap-2">
                          {result.badge && (
                            <span className="badge text-bg-secondary flex-shrink-0">
                              {result.badge}
                            </span>
                          )}

                          <span className="fw-semibold text-truncate">
                            {result.title}
                          </span>
                        </div>

                        {result.subtitle && (
                          <div className="small text-muted text-truncate mt-1">
                            {result.subtitle}
                          </div>
                        )}
                      </div>

                      <i
                        className="bi bi-chevron-right text-muted small mt-2 flex-shrink-0"
                        aria-hidden="true"
                      />
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}