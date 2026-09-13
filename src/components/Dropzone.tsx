'use client';

import { useCallback, useRef, useState } from 'react';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
}

export default function Dropzone({ onFileSelected }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return;
      onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <div
      className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="dropzone__title">Arrastra la foto o escaneo de la carta aqui</p>
      <p className="dropzone__hint">o haz clic para elegir un archivo (JPG, PNG, WEBP)</p>
    </div>
  );
}
