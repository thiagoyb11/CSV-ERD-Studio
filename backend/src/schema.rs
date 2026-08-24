use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum InferredType {
    Integer,
    Decimal,
    Boolean,
    Date,
    Datetime,
    String,
    Empty,
    Mixed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSchema {
    pub id: String,
    pub name: String,
    pub inferred_type: InferredType,
    pub nullable: bool,
    pub unique_count: usize,
    pub null_count: usize,
    pub is_primary_key_candidate: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub row_count: usize,
    pub columns: Vec<ColumnSchema>,
    pub candidate_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub analysis_id: u64,
    pub tables: Vec<TableSchema>,
    pub relationships: Vec<RelationshipSuggestion>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowsPage {
    pub rows: Vec<Vec<String>>,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipSuggestion {
    pub source_table: String,
    pub source_column: String,
    pub target_table: String,
    pub target_column: String,
    pub cardinality: String,
    pub confidence: f32,
    pub status: String,
}
