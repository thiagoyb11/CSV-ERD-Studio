import { useEffect, useRef, useState } from 'react'
import DataTable from '../components/DataTable'
import FileList from '../components/FileList'
import type { AnalysisResult } from '../types/schema'
import { Mermaid } from '../components/Mermaid'

const API_URL = import.meta.env.VITE_API_URL ?? ''

interface ExplorerProps {
  files: File[]
  onAnalysisReady: (analysisId: number) => void
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error((await response.text()) || `Error ${response.status}`)
  }

  return response.json() as Promise<T>
}

export default function Explorer({ files, onAnalysisReady }: ExplorerProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult>()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [error, setError] = useState('')
  const analysisRequest = useRef<Promise<AnalysisResult> | null>(null)

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

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-studio-border sm:flex-row">
      <FileList files={files} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden bg-studio-shell p-2 text-center">
        <div id="visualizador" className="min-h-0 h-full flex-1 border-studio-border border overflow-hidden bg-studio-panel">
          {!analysis && !error && (
            <p className="p-6 text-sm text-studio-muted">Analizando {files.length} archivos…</p>
          )}
          {error && <p className="p-6 text-sm text-red-400">{error}</p>}
          {analysis && <Mermaid analysis={analysis} />}
        </div>

        <div className="mx-auto border-studio-border border flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-studio-panel p-4 text-white">
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
