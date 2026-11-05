import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

interface ModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function Modal({ open, onClose, onConfirm }: ModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    cancelButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="new-analysis-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="new-analysis-title"
            aria-describedby="new-analysis-description"
            className="w-full max-w-md rounded-2xl border border-studio-border bg-studio-panel p-6 text-left shadow-2xl shadow-black/50"
          >
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-studio-warning/30 bg-studio-warning/10 text-studio-warning">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.8 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.8a2 2 0 0 0-3.4 0Z" />
                    </svg>
                  </div>

                  <div>
                    <h2 id="new-analysis-title" className="text-lg font-semibold text-studio-text">
                      ¿Iniciar un nuevo análisis?
                    </h2>
                    <p id="new-analysis-description" className="mt-2 text-sm leading-6 text-studio-muted">
                      Se cerrará el análisis actual y se quitarán los archivos cargados. Esta acción no se puede deshacer.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-studio-border bg-studio-raised px-4 py-2 text-sm font-medium text-studio-text transition-colors hover:border-studio-muted hover:bg-studio-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent-strong"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={onConfirm}
                    className="rounded-lg border border-studio-accent-soft bg-studio-accent px-4 py-2 text-sm font-semibold text-studio-on-accent transition duration-200 hover:-translate-y-0.5 hover:shadow-studio-glow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent-strong"
                  >
                    Sí, iniciar de nuevo
                  </button>
                </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
