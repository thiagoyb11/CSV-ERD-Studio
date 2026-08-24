import { useEffect, useRef, useState } from 'react'
import DataTable from '../components/DataTable'
import FileList from '../components/FileList'
import type { AnalysisResult } from '../types/schema'

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
    <section className="flex w-full flex-1 flex-col overflow-hidden border-t border-studio-border sm:flex-row">
      <FileList files={files} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

      <div className="grid min-h-full min-w-0 w-full place-items-center bg-studio-shell p-6 text-center">
        <div id="visualizador" className="h-full w-full items-center flex flex-col">
          <div className="bg-studio-panel h-full w-full">
            <p className="text-sm font-medium text-studio-text">Área de visualización</p>
            <p className="mt-2 text-xs text-studio-muted">El diagrama se mostrará en este espacio.</p>
          </div>
        </div>

        <div className="mx-auto h-full w-full bg-studio-panel p-4 text-white">
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
