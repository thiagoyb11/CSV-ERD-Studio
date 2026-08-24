use std::{io::Cursor, path::Path};

use chrono::{DateTime, NaiveDate, NaiveDateTime};
use polars::prelude::*;

use crate::schema::{ColumnSchema, InferredType, TableSchema};

pub fn analyze_csv(file_name: &str, bytes: Vec<u8>) -> PolarsResult<(TableSchema, DataFrame)> {
    // Las fechas se mantienen como texto para aceptar columnas que mezclen
    // formatos válidos, por ejemplo YYYY-MM-DD y M/D/YYYY.
    let dataframe = CsvReadOptions::default()
        .with_low_memory(true)
        .into_reader_with_file_handle(Cursor::new(bytes))
        .finish()?;
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
        inferred_type: inferred_type(column),
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

fn inferred_type(column: &Column) -> InferredType {
    match column.dtype() {
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
        DataType::String => infer_string_type(column),
        DataType::Null => InferredType::Empty,
        other => match other.to_string().to_lowercase().as_str() {
            "date" => InferredType::Date,
            value if value.starts_with("datetime") => InferredType::Datetime,
            _ => InferredType::Mixed,
        },
    }
}

fn infer_string_type(column: &Column) -> InferredType {
    let mut has_value = false;
    let mut all_dates = true;
    let mut all_datetimes = true;

    for value in column.as_materialized_series().iter() {
        let value = match value {
            AnyValue::Null => continue,
            AnyValue::String(value) => value.trim(),
            AnyValue::StringOwned(ref value) => value.trim(),
            _ => return InferredType::String,
        };

        if value.is_empty() {
            continue;
        }

        has_value = true;
        all_dates &= is_supported_date(value);
        all_datetimes &= is_supported_datetime(value);

        if !all_dates && !all_datetimes {
            return InferredType::String;
        }
    }

    if !has_value {
        InferredType::Empty
    } else if all_dates {
        InferredType::Date
    } else if all_datetimes {
        InferredType::Datetime
    } else {
        InferredType::String
    }
}

fn is_supported_date(value: &str) -> bool {
    ["%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"]
        .iter()
        .any(|format| NaiveDate::parse_from_str(value, format).is_ok())
}

fn is_supported_datetime(value: &str) -> bool {
    DateTime::parse_from_rfc3339(value).is_ok()
        || [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M:%S%.f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S%.f",
            "%m/%d/%Y %H:%M:%S",
        ]
        .iter()
        .any(|format| NaiveDateTime::parse_from_str(value, format).is_ok())
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

    #[test]
    fn detects_iso_dates() {
        let csv = b"created_at\n2026-08-24\n2026-08-25\n".to_vec();

        let (table, _) = analyze_csv("events.csv", csv).expect("CSV should be valid");

        assert_eq!(table.columns[0].inferred_type, InferredType::Date);
    }

    #[test]
    fn detects_columns_with_mixed_date_formats() {
        let csv = b"last_updated\n2023-07-18\n7/19/2023\n".to_vec();

        let (table, dataframe) =
            analyze_csv("updates.csv", csv).expect("mixed date formats should be valid");

        assert_eq!(table.columns[0].inferred_type, InferredType::Date);
        assert_eq!(
            dataframe.column("last_updated").unwrap().dtype(),
            &DataType::String
        );
    }
}
