import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import FileCard from './FileCard'

const DEFAULT_WIDTH = 288
const MIN_WIDTH = 220
const MAX_WIDTH = 560

interface FileListProps {
  files: File[]
  selectedIndex: number
  onSelect: (index: number) => void
}

export default function FileList({ files, selectedIndex, onSelect }: FileListProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [search, setSearch] = useState<string>("")
  const [resizing, setResizing] = useState(false)
  const reduceMotion = useReducedMotion()
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const totalSize = files.reduce((total, file) => total + file.size, 0)
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleFiles = files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.name.toLocaleLowerCase().includes(normalizedSearch))

  const clampWidth = (nextWidth: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth))

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    }
    setResizing(true)
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    setWidth(clampWidth(drag.current.startWidth + event.clientX - drag.current.startX))
  }

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    drag.current = null
    setResizing(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const widths: Partial<Record<string, number>> = {
      ArrowLeft: width - 10,
      ArrowRight: width + 10,
      Home: MIN_WIDTH,
      End: MAX_WIDTH,
    }
    const nextWidth = widths[event.key]
    if (nextWidth === undefined) return
    event.preventDefault()
    setWidth(clampWidth(nextWidth))
  }

  return (
    <aside
      className="relative flex w-full shrink-0 flex-col border-b border-studio-border bg-studio-panel text-left sm:w-[var(--sidebar-width)] sm:border-b-0 sm:border-r"
      style={{ '--sidebar-width': `${width}px` } as CSSProperties}
    >
      <header className="flex flex-col justify-between border-b border-studio-border px-4 py-4">
        <div className="flex w-full justify-between flex-row">
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-studio-muted">
              Archivos
            </span>
            <strong className="mt-1 block text-sm font-medium text-studio-text">
              Tablas cargadas
            </strong>
          </div>
          <span className="my-auto justify-end min-w-6 place-items-center rounded-full bg-studio-accent-soft px-2 py-1 text-[10px] font-medium text-studio-text">
            {files.length}
          </span>
        </div>
        <input onChange={(e) => {setSearch(e.target.value)}} type="search" className="w-full focus:outline-none focus:border-studio-accent transition-all duration-300 mx-1 bg-studio-raised rounded-lg py-1 px-4 mt-2 text-studio-text placeholder:text-studio-muted" placeholder="Buscar tablas: ">

        </input>
      </header>

      <div className="grid max-h-72 gap-1.5 overflow-y-auto p-2 sm:max-h-[calc(100vh-200px)]">
        <AnimatePresence initial={false} mode="popLayout">
          {visibleFiles.map(({ file, index }) => (
            <motion.div
              layout="position"
              key={`${file.name}-${file.lastModified}-${index}`}
              initial={reduceMotion ? false : { opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <FileCard
                file={file}
                selected={selectedIndex === index}
                onClick={() => onSelect(index)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <footer className="mt-auto border-t border-studio-border px-4 py-3 text-[10px] text-studio-muted">
        {formatTotalSize(totalSize)} en total
      </footer>

      <div
        role="separator"
        aria-label="Cambiar el ancho del panel de archivos"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        className={`absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:content-[''] hover:after:bg-studio-accent focus:outline-none focus:after:bg-studio-accent sm:block ${
          resizing ? 'after:bg-studio-accent' : 'after:bg-transparent'
        }`}
      />
    </aside>
  )
}

function formatTotalSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
