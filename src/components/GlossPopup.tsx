import './GlossPopup.css';

interface GlossPopupProps {
  word: string;
  definition: string;
  loading: boolean;
  error: string;
  x: number;
  y: number;
  onClose: () => void;
}

export default function GlossPopup({ word, definition, loading, error, x, y, onClose }: GlossPopupProps) {
  return (
    <div className="gloss-popup" style={{ left: x, top: y }}>
      <button className="gloss-popup-close" onClick={onClose}>✕</button>
      <div className="gloss-popup-word">{word}</div>
      {loading && (
        <div className="gloss-popup-loading">
          <div className="gloss-popup-spinner" />
          查询中...
        </div>
      )}
      {error && <div className="gloss-popup-error">{error}</div>}
      {!loading && !error && definition && (
        <div className="gloss-popup-definition">{definition}</div>
      )}
    </div>
  );
}
