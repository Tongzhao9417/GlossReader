import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Settings as SettingsType,
  PROVIDERS,
  MODEL_OPTIONS,
  DEFAULT_MODELS,
  BASE_URL_PLACEHOLDERS,
  DEFAULT_GLOSS_PROMPT_TEMPLATE,
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
  getProvider,
} from '../lib/settings';
import {
  DEFAULT_FIND_SHORTCUT,
  DEFAULT_GLOSS_SHORTCUT,
  DEFAULT_HIGHLIGHT_SHORTCUT,
  DEFAULT_ROTATE_CCW_SHORTCUT,
  DEFAULT_ROTATE_CW_SHORTCUT,
  DEFAULT_SQUIGGLY_SHORTCUT,
  DEFAULT_STRIKEOUT_SHORTCUT,
  DEFAULT_UNDERLINE_SHORTCUT,
  DEFAULT_ZOOM_IN_SHORTCUT,
  DEFAULT_ZOOM_OUT_SHORTCUT,
  formatKeyboardShortcutLabel,
  keyboardEventToShortcut,
  normalizeKeyboardShortcut,
} from '../lib/keyboardShortcuts';
import {
  GITHUB_REPOSITORY_URL,
  loadAppInfo,
  openGitHubRepository,
  type AppInfo,
} from '../lib/updater';
import './Settings.css';

type SettingsTab = 'ai' | 'display' | 'reader' | 'shortcuts' | 'vocabulary' | 'about';

interface SettingsProps {
  settings: SettingsType;
  onSettingsChange: (settings: SettingsType) => void;
  onClose: () => void;
  onCheckForUpdate: () => void;
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

const ZOOM_OPTIONS = [
  { label: '适合宽度', value: 'fit-width' },
  { label: '适合页面', value: 'fit-page' },
  { label: '自动', value: 'automatic' },
  { label: '50%', value: '0.5' },
  { label: '75%', value: '0.75' },
  { label: '100%', value: '1' },
  { label: '125%', value: '1.25' },
  { label: '150%', value: '1.5' },
  { label: '200%', value: '2' },
];

const SCROLL_DIRECTION_OPTIONS = [
  { label: '垂直', value: 'vertical' },
  { label: '水平', value: 'horizontal' },
];

const SPREAD_OPTIONS = [
  { label: '单页', value: 'none' },
  { label: '双页（奇数起）', value: 'odd' },
  { label: '双页（偶数起）', value: 'even' },
];

const PAGE_GAP_OPTIONS = [
  { label: '紧凑（8px）', value: '8' },
  { label: '标准（12px）', value: '12' },
  { label: '宽松（16px）', value: '16' },
  { label: '超宽（24px）', value: '24' },
];

const READER_THEME_OPTIONS = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' },
];

interface ShortcutInputProps {
  value: string;
  onChange: (shortcut: string) => void;
}

function ShortcutInput({ value, onChange }: ShortcutInputProps) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Tab') return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }

    const shortcut = keyboardEventToShortcut(event.nativeEvent);
    if (!shortcut) return;

    onChange(shortcut);
    event.currentTarget.blur();
  }

  return (
    <input
      className="settings-shortcut-input"
      value={formatKeyboardShortcutLabel(value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={handleKeyDown}
      readOnly
    />
  );
}

export default function Settings({ settings, onSettingsChange, onClose, onCheckForUpdate }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [showApiKey, setShowApiKey] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: 'GlossReader',
    version: '1.1.0',
  });
  const shortcutConflict =
    normalizeKeyboardShortcut(settings.shortcuts.gloss) ===
    normalizeKeyboardShortcut(settings.shortcuts.find);

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

  const providerConfig = getProvider(settings.ai.provider);

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
          <button className={`settings-nav-item ${activeTab === 'reader' ? 'active' : ''}`} onClick={() => setActiveTab('reader')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
            阅读器
          </button>
          <button className={`settings-nav-item ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M7 9h.01" />
              <path d="M11 9h.01" />
              <path d="M15 9h.01" />
              <path d="M7 13h10" />
            </svg>
            快捷键
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
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {providerConfig?.requiresKey !== false && (
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
                        placeholder={providerConfig?.apiKeyPlaceholder ?? ''}
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
                <div>
                  <div className="settings-label">模型</div>
                  <div className="settings-desc">可从建议中选择，或直接输入模型名称</div>
                </div>
                <div className="settings-control">
                  <input
                    className="settings-input"
                    type="text"
                    list={`models-${settings.ai.provider}`}
                    value={settings.ai.model}
                    onChange={(e) => update('ai', 'model', e.target.value)}
                    placeholder={providerConfig?.defaultModel ?? ''}
                    spellCheck={false}
                  />
                  <datalist id={`models-${settings.ai.provider}`}>
                    {MODEL_OPTIONS[settings.ai.provider]?.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </datalist>
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
                <div>
                  <div className="settings-label">整篇标注相同单词</div>
                  <div className="settings-desc">
                    释义一个单词后，自动在全文标注所有相同单词（按整词匹配，忽略大小写）
                  </div>
                </div>
                <div className="settings-control">
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      checked={settings.glossing.autoGlossAllOccurrences}
                      onChange={(e) =>
                        update('glossing', 'autoGlossAllOccurrences', e.target.checked)
                      }
                    />
                    <span className="settings-switch-track" aria-hidden="true" />
                  </label>
                </div>
              </div>

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

          {activeTab === 'reader' && (
            <>
              <h2 className="settings-section-title">阅读器</h2>

              <div className="settings-row">
                <div>
                  <div className="settings-label">默认缩放</div>
                  <div className="settings-desc">打开文档时的初始缩放</div>
                </div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.reader.defaultZoom}
                    onChange={(e) => update('reader', 'defaultZoom', e.target.value)}
                  >
                    {ZOOM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">滚动方向</div>
                  <div className="settings-desc">垂直或水平滚动翻页</div>
                </div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.reader.scrollDirection}
                    onChange={(e) => update('reader', 'scrollDirection', e.target.value)}
                  >
                    {SCROLL_DIRECTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">页面布局</div>
                  <div className="settings-desc">单页或双页并排显示</div>
                </div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.reader.spreadMode}
                    onChange={(e) => update('reader', 'spreadMode', e.target.value)}
                  >
                    {SPREAD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">页面间距</div>
                  <div className="settings-desc">相邻页面之间的间隙</div>
                </div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={String(settings.reader.pageGap)}
                    onChange={(e) => update('reader', 'pageGap', Number(e.target.value))}
                  >
                    {PAGE_GAP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">阅读器主题</div>
                  <div className="settings-desc">PDF 阅读区域的明暗主题</div>
                </div>
                <div className="settings-control">
                  <select
                    className="settings-select"
                    value={settings.reader.theme}
                    onChange={(e) => update('reader', 'theme', e.target.value)}
                  >
                    {READER_THEME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === 'shortcuts' && (
            <>
              <h2 className="settings-section-title">快捷键</h2>

              <div className="settings-row">
                <div>
                  <div className="settings-label">生成释义</div>
                  <div className="settings-desc">选中单词、词组或句子后触发释义</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.gloss}
                    onChange={(shortcut) => update('shortcuts', 'gloss', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'gloss', DEFAULT_GLOSS_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">查找</div>
                  <div className="settings-desc">打开 PDF 查找侧边栏</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.find}
                    onChange={(shortcut) => update('shortcuts', 'find', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'find', DEFAULT_FIND_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <h2 className="settings-section-title">阅读器</h2>

              <div className="settings-row">
                <div>
                  <div className="settings-label">放大</div>
                  <div className="settings-desc">放大 PDF 视图</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.zoomIn}
                    onChange={(shortcut) => update('shortcuts', 'zoomIn', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'zoomIn', DEFAULT_ZOOM_IN_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">缩小</div>
                  <div className="settings-desc">缩小 PDF 视图</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.zoomOut}
                    onChange={(shortcut) => update('shortcuts', 'zoomOut', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'zoomOut', DEFAULT_ZOOM_OUT_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">顺时针旋转</div>
                  <div className="settings-desc">将页面顺时针旋转 90°</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.rotateClockwise}
                    onChange={(shortcut) => update('shortcuts', 'rotateClockwise', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'rotateClockwise', DEFAULT_ROTATE_CW_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">逆时针旋转</div>
                  <div className="settings-desc">将页面逆时针旋转 90°</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.rotateCounterclockwise}
                    onChange={(shortcut) => update('shortcuts', 'rotateCounterclockwise', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'rotateCounterclockwise', DEFAULT_ROTATE_CCW_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <h2 className="settings-section-title">批注</h2>
              <div className="settings-desc settings-section-hint">
                先选中文本，再按下快捷键即可对所选内容添加标注。
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">高亮</div>
                  <div className="settings-desc">为选中文本添加高亮</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.highlight}
                    onChange={(shortcut) => update('shortcuts', 'highlight', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'highlight', DEFAULT_HIGHLIGHT_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">下划线</div>
                  <div className="settings-desc">为选中文本添加下划线</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.underline}
                    onChange={(shortcut) => update('shortcuts', 'underline', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'underline', DEFAULT_UNDERLINE_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">删除线</div>
                  <div className="settings-desc">为选中文本添加删除线</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.strikeout}
                    onChange={(shortcut) => update('shortcuts', 'strikeout', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'strikeout', DEFAULT_STRIKEOUT_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-label">波浪线</div>
                  <div className="settings-desc">为选中文本添加波浪下划线</div>
                </div>
                <div className="settings-shortcut-control">
                  <ShortcutInput
                    value={settings.shortcuts.squiggly}
                    onChange={(shortcut) => update('shortcuts', 'squiggly', shortcut)}
                  />
                  <button
                    className="settings-action-btn secondary compact"
                    onClick={() => update('shortcuts', 'squiggly', DEFAULT_SQUIGGLY_SHORTCUT)}
                  >
                    默认
                  </button>
                </div>
              </div>

              {shortcutConflict && (
                <div className="settings-shortcut-warning">
                  释义和查找正在使用同一个快捷键。选中文本时释义会优先触发。
                </div>
              )}
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
                  <button className="settings-action-btn" onClick={onCheckForUpdate}>
                    检测更新
                  </button>
                </div>
              </div>

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
