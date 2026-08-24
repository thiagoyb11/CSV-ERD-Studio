use std::{io::Cursor, path::Path};

use polars::prelude::*;

use crate::schema::{ColumnSchema, InferredType, TableSchema};

pub fn analyze_csv(file_name: &str, bytes: Vec<u8>) -> PolarsResult<(TableSchema, DataFrame)> {
    let dataframe = CsvReader::new(Cursor::new(bytes)).finish()?;
    let row_count = dataframe.height();
    let table_name = Path::new(file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled")
        .to_string();
    let table_id = identifier(&table_name);

    let columns = dataframe
        .columns()
        .iter()
        .map(|column| profile_column(column, &table_id, row_count))
        .collect::<PolarsResult<Vec<_>>>()?;

    let candidate_keys = columns
        .iter()
        .filter(|column| column.is_primary_key_candidate)
        .map(|column| column.name.clone())
        .collect();

    Ok((
        TableSchema {
            id: table_id,
            name: table_name,
            file_name: file_name.to_string(),
            row_count,
            columns,
            candidate_keys,
        },
        dataframe,
    ))
}

fn profile_column(column: &Column, table_id: &str, row_count: usize) -> PolarsResult<ColumnSchema> {
    let name = column.name().to_string();
    let null_count = column.null_count();
    let unique_count = column.n_unique()?;
    let is_primary_key_candidate = row_count > 0 && null_count == 0 && unique_count == row_count;
    Ok(ColumnSchema {
        id: format!("{table_id}.{}", identifier(&name)),
        name,
        inferred_type: inferred_type(column.dtype()),
        nullable: null_count > 0,
        unique_count,
        null_count,
        is_primary_key_candidate,
    })
}

pub fn dataframe_rows(
    dataframe: &DataFrame,
    offset: usize,
    limit: usize,
) -> PolarsResult<Vec<Vec<String>>> {
    let end = offset.saturating_add(limit).min(dataframe.height());

    (offset.min(end)..end)
        .map(|row_index| {
            dataframe
                .columns()
                .iter()
                .map(|column| column.get(row_index).map(sample_value))
                .collect()
        })
        .collect()
}

fn sample_value(value: AnyValue<'_>) -> String {
    match value {
        AnyValue::Null => String::new(),
        AnyValue::String(value) => value.to_string(),
        AnyValue::StringOwned(value) => value.to_string(),
        other => other.to_string(),
    }
}

fn inferred_type(data_type: &DataType) -> InferredType {
    match data_type {
        DataType::Boolean => InferredType::Boolean,
        DataType::Int8
        | DataType::Int16
        | DataType::Int32
        | DataType::Int64
        | DataType::UInt8
        | DataType::UInt16
        | DataType::UInt32
        | DataType::UInt64 => InferredType::Integer,
        DataType::Float32 | DataType::Float64 => InferredType::Decimal,
        DataType::String => InferredType::String,
        DataType::Null => InferredType::Empty,
        other => match other.to_string().to_lowercase().as_str() {
            "date" => InferredType::Date,
            value if value.starts_with("datetime") => InferredType::Datetime,
            _ => InferredType::Mixed,
        },
    }
}

fn identifier(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_a_table_schema_from_csv() {
        let csv = b"id,name,active\n1,Ana,true\n2,Juan,false\n".to_vec();

        let (table, dataframe) = analyze_csv("users.csv", csv).expect("CSV should be valid");

        assert_eq!(table.name, "users");
        assert_eq!(table.row_count, 2);
        assert_eq!(table.columns.len(), 3);
        assert_eq!(
            dataframe_rows(&dataframe, 0, 2).expect("rows should be readable"),
            [["1", "Ana", "true"], ["2", "Juan", "false"]]
        );
    }

    #[test]
    fn reads_rows_in_pages() {
        let mut csv = String::from("id,name\n");
        for id in 0..250 {
            csv.push_str(&format!("{id},user-{id}\n"));
        }
        let (_, dataframe) =
            analyze_csv("users.csv", csv.into_bytes()).expect("CSV should be valid");

        let page = dataframe_rows(&dataframe, 100, 100).expect("page should be readable");

        assert_eq!(page.len(), 100);
        assert_eq!(page[0], ["100", "user-100"]);
        assert_eq!(page[99], ["199", "user-199"]);
    }
}
