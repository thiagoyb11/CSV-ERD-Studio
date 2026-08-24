import { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { AnalysisResult, RelationshipSuggestion, TableSchema } from '../types/schema'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  er: { useMaxWidth: true },
})

interface MermaidProps {
  analysis: Pick<AnalysisResult, 'tables' | 'relationships'>
}

// El diagrama es una vista derivada de la metadata; nunca recibe los DataFrames.
export function Mermaid({ analysis }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementId = useId().replace(/:/g, '')
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    const chart = buildChart(analysis.tables, analysis.relationships)

    const renderChart = async () => {
      try {
        const { svg, bindFunctions } = await mermaid.render(`erd-${elementId}`, chart)
        if (!isCurrent || !containerRef.current) return

        containerRef.current.innerHTML = svg
        bindFunctions?.(containerRef.current)
        setError('')
      } catch (renderError) {
        console.error('Mermaid parsing/rendering error:', renderError)
        if (isCurrent) setError('No se pudo renderizar el diagrama.')
      }
    }

    void renderChart()
    return () => {
      isCurrent = false
    }
  }, [analysis, elementId])

  return (
    <div ref={containerRef} className="min-w-max p-6 [&_svg]:max-w-none">
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

function buildChart(tables: TableSchema[], relationships: RelationshipSuggestion[]): string {
  const tableIds = new Map(
    tables.map((table, index) => [table.name, mermaidIdentifier(table.id, `table_${index}`)]),
  )
  const foreignKeys = new Set(
    relationships.map((relationship) => `${relationship.sourceTable}.${relationship.sourceColumn}`),
  )

  const entities = tables.map((table, tableIndex) => buildEntity(table, tableIndex, foreignKeys))
  const links = relationships
    .map((relationship) => buildRelationship(relationship, tableIds))
    .filter((relationship): relationship is string => relationship !== null)

  return ['erDiagram', ...entities, ...links].join('\n')
}

function buildEntity(table: TableSchema, tableIndex: number, foreignKeys: Set<string>): string {
  const columns = table.columns.map((column, columnIndex) => {
    const keys = [
      column.isPrimaryKeyCandidate ? 'PK' : '',
      foreignKeys.has(`${table.name}.${column.name}`) ? 'FK' : '',
    ]
      .filter(Boolean)
      .join(',')

    const keySuffix = keys ? ` ${keys}` : ''
    const columnId = mermaidIdentifier(column.name, `column_${tableIndex}_${columnIndex}`)
    return `        ${column.inferredType} ${columnId}${keySuffix} "${escapeText(column.name)}"`
  })

  const tableId = mermaidIdentifier(table.id, `table_${tableIndex}`)
  return [`    ${tableId} {`, ...columns, '    }'].join('\n')
}

function buildRelationship(
  relationship: RelationshipSuggestion,
  tableIds: Map<string, string>,
): string | null {
  const sourceId = tableIds.get(relationship.sourceTable)
  const targetId = tableIds.get(relationship.targetTable)
  if (!sourceId || !targetId) return null

  // source es la FK y target es la columna referenciada.
  const connector = {
    'one-to-one': '||--||',
    'many-to-one': '||--o{',
    'one-to-many': '}o--||',
    'many-to-many': '}o--o{',
  }[relationship.cardinality]

  const label = `${relationship.sourceColumn} → ${relationship.targetColumn}`
  return `    ${targetId} ${connector} ${sourceId} : "${escapeText(label)}"`
}

function escapeText(value: string): string {
  return value.replace(/["\\]/g, '').replace(/[\r\n]/g, ' ')
}

function mermaidIdentifier(value: string, fallback: string): string {
  const identifier = value.replace(/[^a-zA-Z0-9_]/g, '_')
  if (!identifier) return fallback
  return /^\d/.test(identifier) ? `table_${identifier}` : identifier
}
