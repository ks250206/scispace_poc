import { useMemo } from "react";
import { useTable } from "@tanstack/react-table";
import { visibleTableFeatures } from "../tableFeatures";
import { datasetColumnIds } from "../../domain/csv";
import { useScispaceStore } from "../../store/scispaceStore";
import { formatCellValue } from "./tableModel";

interface UseDataTableModelOptions {
  columnIds?: string[];
  datasetId: string;
}

export const useDataTableModel = ({ columnIds, datasetId }: UseDataTableModelOptions) => {
  const dataset = useScispaceStore((state) => state.datasets.find((item) => item.id === datasetId));

  const requestedColumnIds = useMemo(() => {
    if (!dataset) return [];
    return columnIds && columnIds.length > 0 ? columnIds : datasetColumnIds(dataset);
  }, [columnIds, dataset]);

  const visibleDatasetColumns = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns.filter((column) => requestedColumnIds.includes(column.id));
  }, [dataset, requestedColumnIds]);

  const columns = useMemo(() => {
    return visibleDatasetColumns.map((column) => ({
      accessorKey: column.id,
      header: column.name,
      cell: (info: { getValue: () => unknown }) => formatCellValue(info.getValue()),
    }));
  }, [visibleDatasetColumns]);

  const data = useMemo(() => dataset?.rows ?? [], [dataset]);
  const table = useTable({ data, columns, features: visibleTableFeatures });
  const rows = table.getRowModel().rows;

  return { dataset, rows, table, visibleDatasetColumns };
};
