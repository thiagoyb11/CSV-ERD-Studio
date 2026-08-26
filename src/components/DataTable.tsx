import { useEffect, useRef, useState, type UIEvent } from 'react'
import type { RowsPage, TableSchema } from '../types/schema'

const API_URL = import.meta.env.VITE_API_URL ?? ''
const PAGE_SIZE = 100
const LOAD_MORE_DISTANCE = 160

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error((await response.text()) || `Error ${response.status}`)
  }

  return response.json() as Promise<T>
}

interface DataTableProps {
  analysisId: number
  table: TableSchema
}

export default function DataTable({ analysisId, table }: DataTableProps) {
  const [rows, setRows] = useState<string[][]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    const requestController = new AbortController()
    controller.current = requestController

    // La tabla ya fue parseada: esta petición solo obtiene la primera página.
    const loadFirstPage = async () => {
      try {
        const page = await fetch(
          `${API_URL}/api/analyses/${analysisId}/tables/${encodeURIComponent(table.id)}/rows?offset=0&limit=${PAGE_SIZE}`,
          { signal: requestController.signal },
        ).then(readJson<RowsPage>)

        setRows(page.rows)
        setNextOffset(page.nextOffset)
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las filas')
      } finally {
        if (!requestController.signal.aborted) setLoading(false)
      }
    }

    void loadFirstPage()
    return () => requestController.abort()
  }, [analysisId, table.id])

  const loadMore = async () => {
    if (nextOffset === null || loadingMoreRef.current) return

    loadingMoreRef.current = true
    setLoadingMore(true)

    try {
      const page = await fetch(
        `${API_URL}/api/analyses/${analysisId}/tables/${encodeURIComponent(table.id)}/rows?offset=${nextOffset}&limit=${PAGE_SIZE}`,
        { signal: controller.current?.signal },
      ).then(readJson<RowsPage>)

      setRows((currentRows) => [...currentRows, ...page.rows])
      setNextOffset(page.nextOffset)
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar más filas')
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight

    if (remaining <= LOAD_MORE_DISTANCE) void loadMore()
  }

  if (loading) return <p className="text-sm text-studio-muted">Cargando {table.fileName}…</p>
  if (error) return <p className="text-sm text-red-400">{error}</p>

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <h1 className="mx-auto font-mono text-studio-text">{table.name}.csv</h1>
      <p className="mb-3 text-left text-sm text-studio-muted">
        {table.rowCount} filas · {table.columns.length} columnas
      </p>

      <div className="min-h-0 flex-1 overflow-auto" onScroll={handleScroll}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th
                  className="sticky top-0 z-10 border-b border-studio-border bg-studio-panel p-2 text-studio-text [backface-visibility:hidden]"
                  key={column.id}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-studio-raised transition-all duration-200">
                {row.map((value, columnIndex) => (
                  <td
                    className="border-b border-studio-border/50 p-2"
                    key={table.columns[columnIndex]?.id ?? columnIndex}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {loadingMore && (
          <p className="p-3 text-center text-xs text-studio-muted">Cargando más filas…</p>
        )}
      </div>
    </div>
  )
}
