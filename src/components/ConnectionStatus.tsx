'use client';

import { useEffect, useState } from 'react';
import type { ComfyStatus } from '@/lib/comfyui/types';

interface ConnectionStatusProps {
  comfyUrl: string;
  onUrlChange: (url: string) => void;
}

export default function ConnectionStatus({ comfyUrl, onUrlChange }: ConnectionStatusProps) {
  const [status, setStatus] = useState<ComfyStatus | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkConnection() {
    setChecking(true);
    try {
      const res = await fetch(`/api/comfyui/status?url=${encodeURIComponent(comfyUrl)}`);
      const data: ComfyStatus = await res.json();
      setStatus(data);
    } catch {
      setStatus({ online: false, url: comfyUrl, error: 'Error de red al consultar el estado.' });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="connection-status">
      <div className={`connection-status__dot ${status?.online ? 'is-online' : 'is-offline'}`} />
      <div className="connection-status__body">
        <input
          className="connection-status__url"
          value={comfyUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          spellCheck={false}
        />
        <span className="connection-status__text">
          {checking
            ? 'Comprobando...'
            : status?.online
              ? `Conectado (ComfyUI ${status.systemStats?.comfyuiVersion ?? ''})`
              : status?.error || 'Sin conexion con ComfyUI'}
        </span>
        {status?.online && status.missingModels && status.missingModels.length > 0 && (
          <span className="connection-status__warning">
            Faltan modelos: {status.missingModels.join(', ')}
          </span>
        )}
      </div>
      <button type="button" onClick={checkConnection} disabled={checking} className="btn btn--secondary">
        Comprobar conexion
      </button>
    </div>
  );
}
