import { useId, useState } from "react";

/**
 * Product search (requirements section 13).
 *
 * **It does not search as you type.** The requirement is explicit: the customer
 * types, then presses Enter or clicks Search. This is a real `<form>`, so Enter
 * submits it for free and the button is a plain submit — no key handler, no
 * debounce, and nothing fires per keystroke. Section 19 wants the same thing for
 * a different reason: a query per character is a query per character.
 *
 * The typed value is component state, but the SUBMITTED value lives in the URL,
 * which is why `value` is a prop. That makes a search result linkable and
 * shareable, survives the back button, and lets the filters and the sort in
 * section 14 compose with it — they are all just query parameters on the same
 * page.
 */
export function SearchBar({
  /** The term currently in the URL. The field re-syncs when it changes. */
  value,
  onSearch,
  placeholder = "Search for a shirt, a hoodie...",
  className = "",
}: {
  value: string;
  onSearch: (term: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputId = useId();

  /**
   * What has been typed, STAMPED with the URL term it was typed against.
   *
   * Following a link that changes the query — a category chip, "clear search",
   * the back button — has to be reflected in the field, which is otherwise
   * still holding whatever was typed last. Comparing against the current value
   * resets it during the same render, which is the same pattern the product
   * page uses for the chosen size; an effect that called `setTerm` would
   * cascade a second render on every keystroke's worth of navigation.
   */
  const [typed, setTyped] = useState({ against: value, term: value });
  const term = typed.against === value ? typed.term : value;

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(term.trim());
      }}
      className={`flex w-full items-center gap-2 ${className}`}
    >
      <label htmlFor={inputId} className="sr-only">
        Search products
      </label>

      <div className="relative flex-1">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>

        <input
          id={inputId}
          type="search"
          name="q"
          value={term}
          onChange={(event) => setTyped({ against: value, term: event.target.value })}
          placeholder={placeholder}
          /* A search field must not be autocorrected into something else. */
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={80}
          className="h-11 w-full rounded-full border border-line-strong bg-canvas pr-4 pl-11 text-sm text-ink transition placeholder:text-ink-muted hover:border-ink focus:border-ink focus:outline-none"
        />
      </div>

      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-brand px-6 text-xs font-medium tracking-eyebrow text-canvas uppercase transition duration-200 ease-brand hover:bg-brand-soft"
      >
        Search
      </button>
    </form>
  );
}
