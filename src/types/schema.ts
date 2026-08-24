export type InferredType =
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'string'
  | 'empty'
  | 'mixed'

export interface TableSchema {
  id: string
  name: string
  fileName: string
  rowCount: number
  columns: ColumnSchema[]
  candidateKeys: string[]
}

export interface ColumnSchema {
  id: string
  name: string
  inferredType: InferredType
  nullable: boolean
  uniqueCount: number
  nullCount: number
  isPrimaryKeyCandidate: boolean
}

export interface AnalysisResult {
  analysisId: number
  tables: TableSchema[]
  relationships: RelationshipSuggestion[]
}

export interface RowsPage {
  rows: string[][]
  nextOffset: number | null
}

export interface RelationshipSuggestion {
  sourceTable: string
  sourceColumn: string
  targetTable: string
  targetColumn: string
  cardinality: 'one-to-one' | 'many-to-one' | 'many-to-many' | 'one-to-many'
  confidence: number
  status: 'suggested' | 'accepted' | 'rejected'
}
