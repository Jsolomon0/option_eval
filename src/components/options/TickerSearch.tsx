"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { SymbolLookupItem } from "@/types/options";

type Props = {
  selectedSymbol: string;
  onSelect: (item: SymbolLookupItem) => void;
};

export function TickerSearch({ selectedSymbol, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(selectedSymbol);
  const [debouncedQuery, setDebouncedQuery] = useState(selectedSymbol);
  const [results, setResults] = useState<SymbolLookupItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setQuery(selectedSymbol);
  }, [selectedSymbol]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/market/symbols/search?q=${encodeURIComponent(debouncedQuery)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as SymbolLookupItem[] | { items?: SymbolLookupItem[]; error?: string };
        if (!response.ok) {
          throw new Error((payload as { error?: string }).error ?? "Unable to search symbols");
        }

        const items = Array.isArray(payload) ? payload : payload.items ?? [];
        setResults(items);
        setHighlightedIndex(items.length > 0 ? 0 : -1);
        setIsOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setHighlightedIndex(-1);
          setIsOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    run();
    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleSelect(item: SymbolLookupItem) {
    onSelect(item);
    setQuery(item.symbol);
    setIsOpen(false);
    setResults([]);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) {
      if (event.key === "ArrowDown" && results.length > 0) {
        setIsOpen(true);
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const item = results[highlightedIndex] ?? results[0];
      if (item) {
        handleSelect(item);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium">Ticker</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        placeholder="Search ticker (e.g., AAPL, SPY)"
        className="w-full rounded border px-3 py-2 text-sm"
        autoComplete="off"
      />

      {isOpen && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white shadow">
          {isLoading && <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>}
          {!isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches found.</div>
          )}
          {!isLoading &&
            results.map((item, index) => {
              const isActive = index === highlightedIndex;
              return (
                <button
                  key={`${item.symbol}-${item.exchange ?? "NA"}-${item.type ?? "unknown"}`}
                  className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                    isActive ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(item)}
                >
                  <div className="font-medium">{item.symbol}</div>
                  <div className="text-xs text-gray-600">
                    {item.name ?? item.symbol}
                    {item.exchange ? ` - ${item.exchange}` : ""}
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
