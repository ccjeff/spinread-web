import type { ExportEntry } from "../hooks/useExports";

interface ExportButtonProps {
  entry: ExportEntry | null;
  onExport: () => void;
  onDownload: (entry: ExportEntry) => void;
}

export default function ExportButton({ entry, onExport, onDownload }: ExportButtonProps) {
  if (!entry) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          onExport();
        }}
      >
        导出
      </button>
    );
  }
  if (entry.status === "RENDERING") {
    return (
      <button type="button" className="btn btn-ghost btn-sm" disabled>
        渲染中…
      </button>
    );
  }
  if (entry.status === "FAILED") {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-danger"
        onClick={(e) => {
          e.stopPropagation();
          onExport();
        }}
      >
        失败·重试
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={(e) => {
        e.stopPropagation();
        onDownload(entry);
      }}
    >
      下载
    </button>
  );
}
