use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
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
    pub sample_values: Vec<String>,
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
