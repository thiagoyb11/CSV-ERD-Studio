import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { downloadBlob } from '../utils/export'

interface ExportTooltipProps {
  x: number
  y: number
  mermaidCode: string
  open: boolean
  onClose: () => void
  onExportPng: () => Promise<void>
}

export default function ExportTooltip({
  x,
  y,
  mermaidCode,
  open,
  onClose,
  onExportPng,
}: ExportTooltipProps) {
  const [copyCompleted, setCopyCompleted] = useState(false)
  const [pngPending, setPngPending] = useState(false)
  const [error, setError] = useState('')

  const closeTooltip = () => {
    setCopyCompleted(false)
    setError('')
    onClose()
  }

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCopyCompleted(false)
        setError('')
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const exportMermaid = () => {
    downloadBlob(
      new Blob([mermaidCode], { type: 'text/plain;charset=utf-8' }),
      'csv-erd-diagram.mermaid',
    )
    closeTooltip()
  }

  const copyMermaid = async () => {
    try {
      await copyText(mermaidCode)
      setCopyCompleted(true)
      setError('')
    } catch {
      setError('No se pudo copiar el código.')
    }
  }

  const exportPng = async () => {
    setPngPending(true)
    setError('')

    try {
      await onExportPng()
      closeTooltip()
    } catch (exportError) {
      console.error('PNG export error:', exportError)
      setError('No se pudo exportar el PNG.')
    } finally {
      setPngPending(false)
    }
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="export-tooltip-backdrop"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onPointerDown={closeTooltip}
        >
          <motion.div
            role="menu"
            aria-label="Opciones de exportación"
            className="fixed w-56 overflow-hidden rounded-lg border border-studio-border bg-studio-panel p-1.5 text-sm text-studio-text shadow-xl"
            style={{
              right: Math.max(12, window.innerWidth - x),
              bottom: Math.max(12, window.innerHeight - y),
            }}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
              Exportar diagrama
            </p>
            <button className={optionClassName} onClick={exportMermaid} role="menuitem" type="button">
              <span>Archivo Mermaid</span>
              <span className="text-xs text-studio-muted">.mermaid</span>
            </button>
            <button
              className={optionClassName}
              disabled={pngPending}
              onClick={() => void exportPng()}
              role="menuitem"
              type="button"
            >
              <span>{pngPending ? 'Generando imagen…' : 'Imagen PNG'}</span>
              <span className="text-xs text-studio-muted">.png</span>
            </button>
            <button
              className={optionClassName}
              onClick={() => void copyMermaid()}
              role="menuitem"
              type="button"
            >
              <span>{copyCompleted ? 'Código copiado' : 'Copiar código Mermaid'}</span>
              <span aria-hidden="true" className="text-xs text-studio-muted">
                {copyCompleted ? '✓' : '⌘C'}
              </span>
            </button>
            {error && <p className="px-3 py-2 text-xs text-studio-danger">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

const optionClassName =
  'flex w-full items-center justify-between gap-4 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-studio-accent-soft disabled:cursor-wait disabled:opacity-60'

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  const copied = document.execCommand('copy')
  textArea.remove()

  if (!copied) throw new Error('Clipboard API unavailable')
}
