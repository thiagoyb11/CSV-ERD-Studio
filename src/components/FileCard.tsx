import fileIcon from '../icons/csv-file-format-extension-svgrepo-com.svg'

interface FileCardProps {
  file: File
  selected?: boolean
  onClick?: () => void
}

export default function FileCard({ file, selected = false, onClick }: FileCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex w-full items-center gap-3 rounded-xl border p-3 text-left transition duration-200 ease-out ${
        selected
          ? 'border-studio-accent/50 bg-studio-accent-soft'
          : 'border-transparent bg-studio-panel hover:border-studio-border hover:bg-studio-raised'
      }`}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${selected ? 'bg-studio-accent/15' : 'bg-studio-raised'}`}>
        <img className="size-6" src={fileIcon} alt="" />
      </span>

      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs font-medium text-studio-text" title={file.name}>
          {file.name}
        </strong>
        <span className="mt-1 block text-[10px] text-studio-muted">
          CSV · {formatFileSize(file.size)}
        </span>
      </span>

      <span className={`size-1.5 shrink-0 rounded-full ${selected ? 'bg-studio-accent' : 'bg-studio-border group-hover:bg-studio-muted'}`} />
    </button>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
