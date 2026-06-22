import './UpdateDialog.css';

export type UpdatePhase =
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'uptodate'
  | 'error';

export interface UpdateDialogState {
  phase: UpdatePhase;
  version?: string;
  currentVersion?: string;
  notes?: string;
  /** 0–100, undefined when the download size is unknown. */
  progress?: number;
  error?: string;
}

interface UpdateDialogProps extends UpdateDialogState {
  onStartDownload: () => void;
  onRestart: () => void;
  onClose: () => void;
}

export default function UpdateDialog({
  phase,
  version,
  currentVersion,
  notes,
  progress,
  error,
  onStartDownload,
  onRestart,
  onClose,
}: UpdateDialogProps) {
  // The dialog must not be dismissed while work is in flight.
  const dismissable = phase !== 'downloading' && phase !== 'checking';

  function handleOverlayMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (dismissable && event.target === event.currentTarget) onClose();
  }

  return (
    <div className="update-overlay" onMouseDown={handleOverlayMouseDown}>
      <div className="update-dialog" role="dialog" aria-modal="true">
        {phase === 'checking' && (
          <>
            <h2 className="update-title">检测更新</h2>
            <p className="update-text">正在检测更新...</p>
          </>
        )}

        {phase === 'available' && (
          <>
            <h2 className="update-title">发现新版本</h2>
            <div className="update-version-line">
              <span className="update-version-new">GlossReader {version}</span>
              {currentVersion && (
                <span className="update-version-current">
                  当前版本 {currentVersion}
                </span>
              )}
            </div>
            <div className="update-section-label">更新内容</div>
            <pre className="update-notes">
              {notes?.trim() || '本次更新包含若干改进与问题修复。'}
            </pre>
            <div className="update-actions">
              <button className="update-btn secondary" onClick={onClose}>
                稍后
              </button>
              <button className="update-btn" onClick={onStartDownload}>
                立即更新
              </button>
            </div>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <h2 className="update-title">正在下载更新</h2>
            <div className="update-progress-track">
              <div
                className={`update-progress-fill${
                  progress === undefined ? ' indeterminate' : ''
                }`}
                style={
                  progress === undefined ? undefined : { width: `${progress}%` }
                }
              />
            </div>
            <p className="update-text">
              {progress === undefined
                ? '正在下载更新...'
                : `正在下载更新... ${progress}%`}
            </p>
          </>
        )}

        {phase === 'ready' && (
          <>
            <h2 className="update-title">更新已就绪</h2>
            <p className="update-text">
              新版本{version ? ` ${version}` : ''}已下载完成，重启 GlossReader
              后即可完成安装。
            </p>
            <div className="update-actions">
              <button className="update-btn secondary" onClick={onClose}>
                稍后重启
              </button>
              <button className="update-btn" onClick={onRestart}>
                立即重启
              </button>
            </div>
          </>
        )}

        {phase === 'uptodate' && (
          <>
            <h2 className="update-title">已是最新版本</h2>
            <p className="update-text">
              当前版本{currentVersion ? ` ${currentVersion}` : ''}已是最新。
            </p>
            <div className="update-actions">
              <button className="update-btn" onClick={onClose}>
                好的
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2 className="update-title">更新失败</h2>
            <p className="update-text update-error">{error || '发生未知错误。'}</p>
            <div className="update-actions">
              <button className="update-btn" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
