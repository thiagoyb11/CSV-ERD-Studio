import logo from '../assets/logo.svg'
import Button from './Button'

export default function Menu({ onNewAnalysis }: { onNewAnalysis: () => void }) {
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

      <Button onClick={onNewAnalysis}>Nuevo análisis</Button>
    </header>
  )
}
