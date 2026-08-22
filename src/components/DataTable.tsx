import { useEffect, useState } from 'react'
import type { TableSchema } from '../types/schema'

const API_URL = import.meta.env.VITE_API_URL ?? ''

export default function DataTable({ file }: { file: File }) {
  const [data, setData] = useState<TableSchema>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const formData = new FormData()
    formData.append('file', file)

    fetch(`${API_URL}/api/parse`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error((await response.text()) || `Error ${response.status}`)
        }
        return response.json() as Promise<TableSchema>
      })
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : 'No se pudo analizar el CSV')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [file])

  if (loading) return <p className="text-sm text-studio-muted">Analizando {file?.name}…</p>
  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!data) return null

  const sampleCount = Math.max(0, ...data.columns.map((column) => column.sampleValues.length))

  return (
    <div className="w-full overflow-auto">
      <p className="mb-3 text-left text-sm text-studio-muted">
        {data.rowCount} filas · {data.columns.length} columnas
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th className="border-b border-studio-border p-2" key={column.id}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: sampleCount }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {data.columns.map((column) => (
                <td className="border-b border-studio-border/50 p-2" key={column.id}>
                  {column.sampleValues[rowIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
