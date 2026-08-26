import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import DataTable from '../components/DataTable'
import FileList from '../components/FileList'
import type { AnalysisResult } from '../types/schema'
import { Mermaid } from '../components/Mermaid'

const API_URL = import.meta.env.VITE_API_URL ?? ''
const MIN_PANEL_PERCENTAGE = 20
const MAX_PANEL_PERCENTAGE = 80

interface ExplorerProps {
  files: File[]
  onAnalysisReady: (analysisId: number) => void
  darkMode: boolean
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error((await response.text()) || `Error ${response.status}`)
  }

  return response.json() as Promise<T>
}

export default function Explorer({ files, onAnalysisReady, darkMode }: ExplorerProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult>()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [error, setError] = useState('')
  const [diagramPercentage, setDiagramPercentage] = useState(50)
  const [resizingPanels, setResizingPanels] = useState(false)
  const analysisRequest = useRef<Promise<AnalysisResult> | null>(null)
  const panelsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isCurrent = true

    if (!analysisRequest.current) {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))

      // Se crea una única sesión para todos los CSV seleccionados.
      analysisRequest.current = fetch(`${API_URL}/api/analyses`, {
        method: 'POST',
        body: formData,
      }).then(readJson<AnalysisResult>)
    }

    analysisRequest.current
      .then((result) => {
        if (!isCurrent) return

        setAnalysis(result)
        setSelectedIndex(0)
        onAnalysisReady(result.analysisId)
      })
      .catch((requestError: unknown) => {
        if (!isCurrent) return
        setError(requestError instanceof Error ? requestError.message : 'No se pudo crear el análisis')
      })

    return () => {
      isCurrent = false
    }
  }, [files, onAnalysisReady])

  const selectedTable = analysis?.tables[selectedIndex]

  const resizePanels = (clientY: number) => {
    const panels = panelsRef.current
    if (!panels) return

    const bounds = panels.getBoundingClientRect()
    const nextPercentage = ((clientY - bounds.top) / bounds.height) * 100
    setDiagramPercentage(
      Math.min(MAX_PANEL_PERCENTAGE, Math.max(MIN_PANEL_PERCENTAGE, nextPercentage)),
    )
  }

  const startPanelResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizingPanels(true)
    resizePanels(event.clientY)
  }

  const continuePanelResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizingPanels) return
    resizePanels(event.clientY)
  }

  const stopPanelResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizingPanels) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setResizingPanels(false)
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const change = event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0
    if (!change) return

    event.preventDefault()
    setDiagramPercentage((current) =>
      Math.min(MAX_PANEL_PERCENTAGE, Math.max(MIN_PANEL_PERCENTAGE, current + change)),
    )
  }

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-studio-border sm:flex-row">
      <FileList files={files} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

      <div
        ref={panelsRef}
        className={`grid min-h-0 min-w-0 flex-1 overflow-hidden bg-studio-shell p-2 text-center ${
          resizingPanels ? 'cursor-row-resize select-none' : ''
        }`}
        style={{ gridTemplateRows: `${diagramPercentage}fr 10px ${100 - diagramPercentage}fr` }}
      >
        <div id="visualizador" className="min-h-0 overflow-hidden border border-studio-border bg-studio-panel">
          {!analysis && !error && (
            <p className="p-6 text-sm text-studio-muted">Analizando {files.length} archivos…</p>
          )}
          {error && <p className="p-6 text-sm text-red-400">{error}</p>}
          {analysis && <Mermaid analysis={analysis} darkMode={darkMode} />}
        </div>

        <div
          aria-label="Redimensionar diagrama y tabla"
          aria-orientation="horizontal"
          aria-valuemax={MAX_PANEL_PERCENTAGE}
          aria-valuemin={MIN_PANEL_PERCENTAGE}
          aria-valuenow={Math.round(diagramPercentage)}
          className="group flex touch-none cursor-row-resize items-center justify-center outline-none"
          onKeyDown={resizeWithKeyboard}
          onPointerCancel={stopPanelResize}
          onPointerDown={startPanelResize}
          onPointerMove={continuePanelResize}
          onPointerUp={stopPanelResize}
          role="separator"
          tabIndex={0}
        >
          <span className="h-1 w-14 rounded-full bg-studio-border transition-colors group-hover:bg-studio-accent group-focus-visible:bg-studio-accent" />
        </div>

        <div className="mx-auto flex min-h-0 w-full flex-col overflow-hidden border border-studio-border bg-studio-panel p-4 text-studio-text">
          {!analysis && !error && (
            <p className="text-sm text-studio-muted">Analizando {files.length} archivos…</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {analysis && selectedTable && (
            <DataTable
              key={`${analysis.analysisId}-${selectedTable.id}`}
              analysisId={analysis.analysisId}
              table={selectedTable}
            />
          )}
        </div>
      </div>
    </section>
  )
}
