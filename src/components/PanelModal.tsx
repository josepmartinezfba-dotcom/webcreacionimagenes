'use client';

interface PanelModalProps {
  imageUrl: string;
  fileName: string;
  onClose: () => void;
}

export default function PanelModal({ imageUrl, fileName, onClose }: PanelModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={fileName} className="modal-content__image" />
        <div className="modal-content__actions">
          <a className="btn btn--primary" href={imageUrl} download={fileName}>
            Descargar {fileName}
          </a>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
