import { useState } from 'react'
import FileCard from './FileCard'

export default function FileList({ files }: { files: File[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const totalSize = files.reduce((total, file) => total + file.size, 0)

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-studio-border bg-studio-panel text-left sm:w-72 sm:border-b-0 sm:border-r">
      <header className="flex items-center justify-between border-b border-studio-border px-4 py-4">
        <div>
          <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-studio-muted">
            Archivos
          </span>
          <strong className="mt-1 block text-sm font-medium text-studio-text">
            Tablas cargadas
          </strong>
        </div>
        <span className="grid min-w-6 place-items-center rounded-full bg-studio-accent-soft px-2 py-1 text-[10px] font-medium text-studio-accent">
          {files.length}
        </span>
      </header>

      <div className="grid max-h-72 gap-1.5 overflow-y-auto p-2 sm:max-h-[calc(100vh-200px)]">
        {files.map((file, index) => (
          <FileCard
            key={`${file.name}-${file.lastModified}-${index}`}
            file={file}
            selected={selectedIndex === index}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </div>

      <footer className="mt-auto border-t border-studio-border px-4 py-3 text-[10px] text-studio-muted">
        {formatTotalSize(totalSize)} en total
      </footer>
    </aside>
  )
}

function formatTotalSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
