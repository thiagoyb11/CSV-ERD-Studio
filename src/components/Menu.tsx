import logo from '../assets/logo.svg'

export default function Menu() {
  return (
    <header className="flex h-16 w-full items-center justify-between overflow-hidden border-b border-studio-border bg-studio-panel px-5 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={logo}
          alt="Logo de CSV ERD Studio"
          width="36"
          height="36"
          className="shrink-0 rounded-lg object-contain"
          style={{ width: 36, height: 36 }}
        />
        <span className="truncate text-base font-semibold tracking-tight text-studio-text">
          CSV ERD Studio
        </span>
      </div>

      <button
        type="button"
        className="rounded-lg bg-studio-accent px-4 py-2 text-xs font-medium text-studio-shell transition hover:brightness-95"
      >
        Nuevo análisis
      </button>
    </header>
  )
}
