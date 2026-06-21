import { useEffect, useState } from 'react';
import {
  Settings as SettingsType,
  MODEL_OPTIONS,
  DEFAULT_MODELS,
  BASE_URL_PLACEHOLDERS,
  DEFAULT_GLOSS_PROMPT_TEMPLATE,
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
} from '../lib/settings';
import {
  checkAndInstallUpdate,
  GITHUB_REPOSITORY_URL,
  loadAppInfo,
  openGitHubRepository,
  type AppInfo,
  type UpdateState,
} from '../lib/updater';
import './Settings.css';

type SettingsTab = 'ai' | 'display' | 'vocabulary' | 'about';

interface SettingsProps {
  settings: SettingsType;
  onSettingsChange: (settings: SettingsType) => void;
  onClose: () => void;
}

const DOMAIN_OPTIONS = [
  { label: '自动检测', value: 'auto' },
  { label: '心理学', value: 'psychology' },
  { label: '认知神经科学', value: 'cognitive-neuroscience' },
  { label: '计算机科学', value: 'computer-science' },
  { label: '医学', value: 'medicine' },
  { label: '经济学', value: 'economics' },
  { label: '统计学', value: 'statistics' },
];

const LANGUAGE_OPTIONS = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
];

const FONT_SIZE_OPTIONS = [
  { label: '8px', value: '8px' },
  { label: '10px', value: '10px' },
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '22px', value: '22px' },
];

const OPACITY_OPTIONS = [
  { label: '30%', value: '30' },
  { label: '50%', value: '50' },
  { label: '70%', value: '70' },
  { label: '100%', value: '100' },
];

const COLOR_OPTIONS = [
  { label: '灰色', value: 'gray', color: '#888888' },
  { label: '红色', value: 'red', color: '#c0392b' },
  { label: '蓝色', value: 'blue', color: '#2980b9' },
  { label: '绿色', value: 'green', color: '#2e7d32' },
  { label: '紫色', value: 'purple', color: '#7b3fb3' },
  { label: '黑色', value: 'black', color: '#1f2328' },
];

export default function Settings({ settings, onSettingsChange, onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [showApiKey, setShowApiKey] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: 'GlossReader',
    version: '1.0.0',
  });
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    message: '',
  });
  const isCheckingUpdate =
    updateState.status === 'checking' ||
    updateState.status === 'downloading' ||
    updateState.status === 'installing' ||
    updateState.status === 'restarting';

  useEffect(() => {
    let cancelled = false;

    void loadAppInfo().then((info) => {
      if (!cancelled) setAppInfo(info);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof SettingsType>(
    section: K,
    field: keyof SettingsType[K],
    value: SettingsType[K][keyof SettingsType[K]],
  ) {
    onSettingsChange({
      ...settings,
      [section]: { ...settings[section], [field]: value },
    });
  }

  function handleProviderChange(provider: SettingsType['ai']['provider']) {
    onSettingsChange({
      ...settings,
      ai: {
        ...settings.ai,
        provider,
        model: DEFAULT_MODELS[provider],
        baseUrl: '',
      },
    });
  }

  async function handleCheckForUpdate() {
    await checkAndInstallUpdate(setUpdateState, { confirmBeforeInstall: true });
  }

  return (
    <div className="settings-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-dialog">

        {/* Sidebar */}
        <div className="settings-sidebar">
          <div className="settings-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input type="text" placeholder="搜索设置" />
          </div>
          <div className="settings-sidebar-label">设置</div>

          <button className={`settings-nav-item ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            AI 模型
          </button>
          <button className={`settings-nav-item ${activeTab === 'display' ? 'active' : ''}`} onClick={() => setActiveTab('display')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16" />
              <path d="M4 12h10" />
              <path d="M4 18h7" />
              <path d="M17 14l3 3-3 3" />
            </svg>
            显示
          </button>
          <button className={`settings-nav-item ${activeTab === 'vocabulary' ? 'active' : ''}`} onClick={() => setActiveTab('vocabulary')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
            词汇
          </button>
          <button className={`settings-nav-item ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            关于
          </button>
        </div>

        {/* Content */}
        <div className="settings-content">
          <button className="settings-close-btn" onClick={onClose}>✕</button>

          {activeTab === 'ai' && (
            <>
              <h2 className="settings-section-title">AI 服务</h2>

              <div className="settings-row">
                <div><div className="settings-label">服务商</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.ai.provider}
                    onChange={(e) => handleProviderChange(e.target.value as SettingsType['ai']['provider'])}
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="ollama">Ollama (本地)</option>
                  </select>
                </div>
              </div>

              {settings.ai.provider !== 'ollama' && (
                <div className="settings-row">
                  <div>
                    <div className="settings-label">API Key</div>
                    <div className="settings-desc">密钥仅存储在本地，不会上传</div>
                  </div>
                  <div className="settings-control">
                    <div className="settings-password-field">
                      <input
                        className="settings-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={settings.ai.apiKey}
                        onChange={(e) => update('ai', 'apiKey', e.target.value)}
                        placeholder={settings.ai.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                      />
                      <button className="settings-password-toggle" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                            <path d="M1 1l22 22" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="settings-row">
                <div><div className="settings-label">模型</div></div>
                <div className="settings-control">
                  {settings.ai.provider === 'ollama' ? (
                    <input
                      className="settings-input"
                      type="text"
                      value={settings.ai.model}
                      onChange={(e) => update('ai', 'model', e.target.value)}
                      placeholder="llama3"
                    />
                  ) : (
                    <select
                      className="settings-select"
                      value={settings.ai.model}
                      onChange={(e) => update('ai', 'model', e.target.value)}
                    >
                      {MODEL_OPTIONS[settings.ai.provider]?.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">Base URL</div>
                  <div className="settings-desc">自定义 API 端点（可选）</div>
                </div>
                <div className="settings-control">
                  <input
                    className="settings-input"
                    type="text"
                    value={settings.ai.baseUrl}
                    onChange={(e) => update('ai', 'baseUrl', e.target.value)}
                    placeholder={BASE_URL_PLACEHOLDERS[settings.ai.provider] ?? ''}
                  />
                </div>
              </div>

              <h2 className="settings-section-title">Prompt 设置</h2>

              <div className="settings-row settings-row-block">
                <div>
                  <div className="settings-label">单词/词组释义 Prompt</div>
                  <div className="settings-desc">用于选中单词或短语后生成上方释义</div>
                </div>
                <div className="settings-control-stack">
                  <textarea
                    className="settings-textarea"
                    value={settings.ai.glossPromptTemplate}
                    onChange={(e) => update('ai', 'glossPromptTemplate', e.target.value)}
                    spellCheck={false}
                  />
                  <div className="settings-prompt-footer">
                    <span className="settings-prompt-help">
                      可用变量：{'{word}'}、{'{sentence}'}、{'{language}'}、{'{domainLine}'}
                    </span>
                    <button
                      className="settings-action-btn secondary"
                      onClick={() => update('ai', 'glossPromptTemplate', DEFAULT_GLOSS_PROMPT_TEMPLATE)}
                    >
                      恢复默认
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-row settings-row-block">
                <div>
                  <div className="settings-label">长句/段落翻译 Prompt</div>
                  <div className="settings-desc">用于选中句子或段落后生成侧边翻译</div>
                </div>
                <div className="settings-control-stack">
                  <textarea
                    className="settings-textarea"
                    value={settings.ai.translationPromptTemplate}
                    onChange={(e) => update('ai', 'translationPromptTemplate', e.target.value)}
                    spellCheck={false}
                  />
                  <div className="settings-prompt-footer">
                    <span className="settings-prompt-help">
                      可用变量：{'{text}'}、{'{language}'}、{'{domainLine}'}
                    </span>
                    <button
                      className="settings-action-btn secondary"
                      onClick={() => update('ai', 'translationPromptTemplate', DEFAULT_TRANSLATION_PROMPT_TEMPLATE)}
                    >
                      恢复默认
                    </button>
                  </div>
                </div>
              </div>

              <h2 className="settings-section-title">释义设置</h2>

              <div className="settings-row">
                <div><div className="settings-label">默认论文领域</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.glossing.defaultDomain}
                    onChange={(e) => update('glossing', 'defaultDomain', e.target.value)}
                  >
                    {DOMAIN_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div><div className="settings-label">释义语言</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.glossing.language}
                    onChange={(e) => update('glossing', 'language', e.target.value)}
                  >
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === 'display' && (
            <>
              <h2 className="settings-section-title">注释显示</h2>

              <div className="settings-row">
                <div><div className="settings-label">注释字号</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.display.translationFontSize}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        display: {
                          ...settings.display,
                          annotationFontSize: e.target.value,
                          translationFontSize: e.target.value,
                        },
                      })
                    }
                  >
                    {FONT_SIZE_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div><div className="settings-label">注释颜色</div></div>
                <div className="settings-control">
                  <div className="settings-btn-group settings-color-group">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        className={settings.display.translationColor === c.value ? 'active' : ''}
                        onClick={() =>
                          onSettingsChange({
                            ...settings,
                            display: {
                              ...settings.display,
                              annotationColor: c.value,
                              translationColor: c.value,
                            },
                          })
                        }
                      >
                        <span className="settings-color-swatch" style={{ background: c.color }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div><div className="settings-label">注释透明度</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.display.translationOpacity}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        display: {
                          ...settings.display,
                          annotationOpacity: e.target.value,
                          translationOpacity: e.target.value,
                        },
                      })
                    }
                  >
                    {OPACITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <h2 className="settings-section-title">长句批注</h2>

              <div className="settings-row">
                <div><div className="settings-label">批注字号</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.display.translationFontSize}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        display: {
                          ...settings.display,
                          annotationFontSize: e.target.value,
                          translationFontSize: e.target.value,
                        },
                      })
                    }
                  >
                    {FONT_SIZE_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div><div className="settings-label">批注颜色</div></div>
                <div className="settings-control">
                  <div className="settings-btn-group settings-color-group">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        className={settings.display.translationColor === c.value ? 'active' : ''}
                        onClick={() =>
                          onSettingsChange({
                            ...settings,
                            display: {
                              ...settings.display,
                              annotationColor: c.value,
                              translationColor: c.value,
                            },
                          })
                        }
                      >
                        <span className="settings-color-swatch" style={{ background: c.color }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div><div className="settings-label">批注透明度</div></div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.display.translationOpacity}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        display: {
                          ...settings.display,
                          annotationOpacity: e.target.value,
                          translationOpacity: e.target.value,
                        },
                      })
                    }
                  >
                    {OPACITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === 'vocabulary' && (
            <div className="settings-placeholder">词汇设置 — 敬请期待</div>
          )}

          {activeTab === 'about' && (
            <div className="settings-about">
              <div className="settings-about-header">
                <img
                  className="settings-about-icon"
                  src="/glossreader-icon-32.png"
                  alt=""
                />
                <div>
                  <h2 className="settings-about-title">{appInfo.name}</h2>
                  <div className="settings-about-version">版本 {appInfo.version}</div>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">软件更新</div>
                  <div className="settings-desc">从 GitHub Release 检测并安装新版本</div>
                </div>
                <div className="settings-control">
                  <button
                    className="settings-action-btn"
                    disabled={isCheckingUpdate}
                    onClick={handleCheckForUpdate}
                  >
                    {isCheckingUpdate ? '正在更新...' : '检测更新'}
                  </button>
                </div>
              </div>

              {updateState.message && (
                <div
                  className={`settings-update-status status-${updateState.status}`}
                >
                  {updateState.message}
                </div>
              )}

              <div className="settings-row">
                <div>
                  <div className="settings-label">GitHub</div>
                  <div className="settings-desc">{GITHUB_REPOSITORY_URL}</div>
                </div>
                <div className="settings-control">
                  <button
                    className="settings-action-btn secondary"
                    onClick={openGitHubRepository}
                  >
                    打开链接
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
