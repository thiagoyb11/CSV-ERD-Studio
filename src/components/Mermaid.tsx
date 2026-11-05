import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import mermaid from 'mermaid'
import type { AnalysisResult, RelationshipSuggestion, TableSchema } from '../types/schema'
import exportIco from '../icons/export.svg'
import ExportTooltip from './ExportTooltip'
import { downloadBlob } from '../utils/export'

// Mermaid y la exportación a PNG necesitan colores literales: el SVG serializado
// no resuelve var(). Estos valores reflejan los tokens studio de index.css.
const DIAGRAM_COLORS = {
  dark: {
    background: '#171a17',
    primaryColor: '#27351f',
    primaryTextColor: '#f0f2eb',
    primaryBorderColor: '#4f6636',
    secondaryColor: '#20241f',
    tertiaryColor: '#20241f',
    lineColor: '#9ca398',
    textColor: '#f0f2eb',
    nodeTextColor: '#f0f2eb',
    edgeLabelBackground: '#171a17',
    rowOdd: '#20241f',
    rowEven: '#171a17',
  },
  light: {
    background: '#ffffff',
    primaryColor: '#e3efcf',
    primaryTextColor: '#20251e',
    primaryBorderColor: '#9db585',
    secondaryColor: '#e9ede5',
    tertiaryColor: '#e9ede5',
    lineColor: '#596354',
    textColor: '#20251e',
    nodeTextColor: '#20251e',
    edgeLabelBackground: '#ffffff',
    rowOdd: '#ffffff',
    rowEven: '#f4f6f1',
  },
}

interface MermaidProps {
  analysis: Pick<AnalysisResult, 'tables' | 'relationships'>
  darkMode: boolean
}

// El diagrama es una vista derivada de la metadata; nunca recibe los DataFrames.
export function Mermaid({ analysis, darkMode }: MermaidProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const diagramRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    startX: number
    startY: number
  } | null>(null)
  const elementId = useId().replace(/:/g, '')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [exportMenu, setExportMenu] = useState({ open: false, x: 0, y: 0 })
  const chart = buildChart(analysis.tables, analysis.relationships)

  const fitDiagram = () => {
    const viewport = viewportRef.current
    const svg = diagramRef.current?.querySelector('svg')
    if (!viewport || !svg) return

    // Mermaid puede dejar nodos fuera de su viewBox original. El bounding box del
    // contenido renderizado incluye esas tablas y relaciones, evitando el recorte.
    const bounds = svg.getBBox()
    if (!bounds.width || !bounds.height) return

    const contentPadding = 32
    const viewBoxX = bounds.x - contentPadding
    const viewBoxY = bounds.y - contentPadding
    const diagramWidth = bounds.width + contentPadding * 2
    const diagramHeight = bounds.height + contentPadding * 2
    svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${diagramWidth} ${diagramHeight}`)
    svg.setAttribute('width', `${diagramWidth}`)
    svg.setAttribute('height', `${diagramHeight}`)

    const padding = 48
    const availableWidth = Math.max(1, viewport.clientWidth - padding * 2)
    const availableHeight = Math.max(1, viewport.clientHeight - padding * 2)
    const scale = Math.min(availableWidth / diagramWidth, availableHeight / diagramHeight)

    // Centra el SVG completo. El usuario puede acercarlo después si quiere leer detalle.
    setView({
      scale,
      x: (viewport.clientWidth - diagramWidth * scale) / 2,
      y: (viewport.clientHeight - diagramHeight * scale) / 2,
    })
  }

  useEffect(() => {
    let isCurrent = true
    const renderChart = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: { ...DIAGRAM_COLORS[darkMode ? 'dark' : 'light'], darkMode },
          securityLevel: 'strict',
          // Las etiquetas HTML usan foreignObject, que bloquea la exportación a PNG.
          htmlLabels: false,
          // El visor controla el tamaño; Mermaid no debe reducir el SVG automáticamente.
          er: { useMaxWidth: false },
        })
        const { svg, bindFunctions } = await mermaid.render(`erd-${elementId}`, chart)
        if (!isCurrent || !diagramRef.current) return

        diagramRef.current.innerHTML = svg
        bindFunctions?.(diagramRef.current)
        requestAnimationFrame(() => {
          if (isCurrent) fitDiagram()
        })
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
  }, [analysis, chart, darkMode, elementId])

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target instanceof HTMLButtonElement) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: view.x,
      startY: view.y,
    }
    setDragging(true)
  }

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current
    if (!start || start.pointerId !== event.pointerId) return

    setView((current) => ({
      ...current,
      x: start.startX + event.clientX - start.x,
      y: start.startY + event.clientY - start.y,
    }))
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return

    dragRef.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const zoom = (nextScale: number) => {
    setView((current) => ({ ...current, scale: clampScale(nextScale) }))
  }

  const zoomWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    const nextScale = clampScale(view.scale * zoomFactor)
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - bounds.left
    const pointerY = event.clientY - bounds.top
    const scaleRatio = nextScale / view.scale

    // Mantiene el punto bajo el cursor en la misma posición al acercar o alejar.
    setView({
      scale: nextScale,
      x: pointerX - (pointerX - view.x) * scaleRatio,
      y: pointerY - (pointerY - view.y) * scaleRatio,
    })
  }

  const openExportMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    setExportMenu({
      open: true,
      x: bounds.right,
      y: bounds.top - 8,
    })
  }

  const exportPng = async () => {
    const sourceSvg = diagramRef.current?.querySelector('svg')
    if (!sourceSvg) throw new Error('The diagram is not ready')

    const viewBox = sourceSvg.viewBox.baseVal
    const sourceWidth = viewBox.width || sourceSvg.getBoundingClientRect().width
    const sourceHeight = viewBox.height || sourceSvg.getBoundingClientRect().height
    if (!sourceWidth || !sourceHeight) throw new Error('The diagram has no dimensions')

    const clonedSvg = sourceSvg.cloneNode(true) as SVGSVGElement
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clonedSvg.setAttribute('width', `${sourceWidth}`)
    clonedSvg.setAttribute('height', `${sourceHeight}`)

    const svgBlob = new Blob([new XMLSerializer().serializeToString(clonedSvg)], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const svgUrl = URL.createObjectURL(svgBlob)

    try {
      const image = await loadImage(svgUrl)
      const exportScale = Math.min(2, 4096 / Math.max(sourceWidth, sourceHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sourceWidth * exportScale))
      canvas.height = Math.max(1, Math.round(sourceHeight * exportScale))

      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable')

      context.fillStyle = DIAGRAM_COLORS[darkMode ? 'dark' : 'light'].background
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const pngBlob = await canvasToBlob(canvas)
      downloadBlob(pngBlob, 'csv-erd-diagram.png')
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`relative h-full min-h-0 w-full touch-none overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={startDrag}
      onPointerMove={drag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={zoomWithWheel}
    >
      <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded border border-studio-border bg-studio-raised shadow">
        <button className="px-3 py-1 text-studio-text hover:bg-studio-accent-soft" onClick={() => zoom(view.scale * 1.2)} type="button">
          +
        </button>
        <button className="border-x border-studio-border px-3 py-1 text-studio-text hover:bg-studio-accent-soft" onClick={() => zoom(view.scale / 1.2)} type="button">
          −
        </button>
        <button className="px-3 py-1 text-xs text-studio-text hover:bg-studio-accent-soft" onClick={fitDiagram} type="button">
          Restablecer
        </button>
      </div>

      <div
        ref={diagramRef}
        className="absolute left-0 top-0 min-w-max p-6 [&_svg]:max-w-none"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}
      />
      {error && <p className="p-6 text-sm text-studio-danger">{error}</p>}
      <div
        className="absolute bottom-3 right-3 z-10 flex overflow-hidden rounded border border-studio-border bg-studio-raised shadow"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          aria-expanded={exportMenu.open}
          aria-haspopup="menu"
          className="flex h-8 w-[108px] flex-row items-center justify-between px-3 py-1 text-xs text-studio-text hover:bg-studio-accent-soft"
          onClick={openExportMenu}
          type="button"
        >
          <span>Exportar</span>
          <span
            aria-hidden="true"
            className="h-4 w-4 bg-studio-accent-strong mask-contain mask-center mask-no-repeat"
            style={{ maskImage: `url("${exportIco}")` }}
          />
        </button>
      </div>
      <ExportTooltip
        mermaidCode={chart}
        onClose={() => setExportMenu((current) => ({ ...current, open: false }))}
        onExportPng={exportPng}
        open={exportMenu.open}
        x={exportMenu.x}
        y={exportMenu.y}
      />
    </div>
  )
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The SVG could not be loaded'))
    image.src = source
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The PNG could not be generated'))
    }, 'image/png')
  })
}

function clampScale(scale: number): number {
  return Math.min(20, Math.max(0.05, scale))
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
