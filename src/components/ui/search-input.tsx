type SearchInputProps = {
  placeholder?: string;
  value?: string;
};

export function SearchInput({ placeholder = "Cerca...", value }: SearchInputProps) {
  return (
    <div className="input-group wide-search">
      <span className="input-group-text bg-white">🔎</span>
      <input
        className="form-control"
        type="search"
        placeholder={placeholder}
        aria-label="Cerca"
        defaultValue={value}
      />
    </div>
  );
}
