import { useCallback, useRef, useState, type DragEvent } from 'react';

interface UploadZoneProps {
  disabled?: boolean;
  onFile: (file: File) => void;
}

export function UploadZone({ disabled, onFile }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    (file: File | undefined | null) => {
      if (!file || disabled) return;
      onFile(file);
    },
    [disabled, onFile],
  );

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="upload-card">
      <div
        className={`upload-zone${dragging ? ' dragging' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <h2>Carregar PDF</h2>
        <p>
          Arraste um arquivo ou selecione no explorador. O documento permanece no
          seu navegador — nada é enviado a servidores.
        </p>
        <button
          type="button"
          className="file-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Selecionar PDF
        </button>
        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
