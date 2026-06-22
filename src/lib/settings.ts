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
} from './keyboardShortcuts';

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'minimax'
  | 'kimi'
  | 'mimo'
  | 'openrouter'
  | 'volcengine'
  | 'ollama';

export interface Settings {
  ai: {
    provider: ProviderId;
    apiKey: string;
    model: string;
    baseUrl: string;
    glossPromptTemplate: string;
    translationPromptTemplate: string;
  };
  glossing: {
    defaultDomain: string;
    language: string;
    /** When on, glossing a single word marks every occurrence in the document. */
    autoGlossAllOccurrences: boolean;
  };
  display: {
    annotationFontSize: string;
    annotationColor: string;
    annotationOpacity: string;
    translationFontSize: string;
    translationColor: string;
    translationOpacity: string;
  };
  reader: {
    /** 'fit-width' | 'fit-page' | 'automatic' | numeric scale string ('1' = 100%) */
    defaultZoom: string;
    /** 'vertical' | 'horizontal' */
    scrollDirection: string;
    /** 'none' | 'odd' | 'even' */
    spreadMode: string;
    /** Gap between pages, in px */
    pageGap: number;
    /** 'light' | 'dark' | 'system' */
    theme: string;
  };
  shortcuts: {
    gloss: string;
    find: string;
    zoomIn: string;
    zoomOut: string;
    rotateClockwise: string;
    rotateCounterclockwise: string;
    highlight: string;
    underline: string;
    strikeout: string;
    squiggly: string;
  };
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** Origin only — apiPath is appended in aiService to form the chat/completions URL. */
  baseUrl: string;
  /** Version path between origin and /chat/completions, e.g. "/v1", "/v1beta/openai". */
  apiPath: string;
  /** Suggested models shown in the combobox; users may type any model string. */
  models: { label: string; value: string }[];
  defaultModel: string;
  apiKeyPlaceholder: string;
  /** false only for local providers that need no key (ollama). */
  requiresKey: boolean;
}

// Single source of truth for AI providers. All are OpenAI-compatible
// (Bearer auth, /chat/completions). To add a provider, append an entry here
// and a matching dev-proxy line in vite.config.ts.
export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    apiPath: '/v1',
    models: [
      { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
      { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
      { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    ],
    defaultModel: 'claude-haiku-4-5',
    apiKeyPlaceholder: 'sk-ant-...',
    requiresKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    apiPath: '/v1',
    models: [
      { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
      { label: 'GPT-4o', value: 'gpt-4o' },
      { label: 'GPT-4.1', value: 'gpt-4.1' },
    ],
    defaultModel: 'gpt-4o-mini',
    apiKeyPlaceholder: 'sk-...',
    requiresKey: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiPath: '/v1',
    models: [
      { label: 'DeepSeek V4 Flash', value: 'deepseek-v4-flash' },
      { label: 'DeepSeek V4 Pro', value: 'deepseek-v4-pro' },
    ],
    defaultModel: 'deepseek-v4-flash',
    apiKeyPlaceholder: 'sk-...',
    requiresKey: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiPath: '/v1beta/openai',
    models: [
      { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      { label: 'Gemini 3 Flash (Preview)', value: 'gemini-3-flash-preview' },
    ],
    defaultModel: 'gemini-2.5-flash',
    apiKeyPlaceholder: 'AIza...',
    requiresKey: true,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.io',
    apiPath: '/v1',
    models: [
      { label: 'MiniMax-M2.5', value: 'MiniMax-M2.5' },
      { label: 'MiniMax-M3', value: 'MiniMax-M3' },
      { label: 'MiniMax-M2', value: 'MiniMax-M2' },
    ],
    defaultModel: 'MiniMax-M2.5',
    apiKeyPlaceholder: 'API Key',
    requiresKey: true,
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn',
    apiPath: '/v1',
    models: [
      { label: 'Kimi K2.6', value: 'kimi-k2.6' },
      { label: 'Kimi K2.5', value: 'kimi-k2.5' },
      { label: 'Moonshot v1 8K', value: 'moonshot-v1-8k' },
    ],
    defaultModel: 'kimi-k2.5',
    apiKeyPlaceholder: 'sk-...',
    requiresKey: true,
  },
  {
    id: 'mimo',
    label: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com',
    apiPath: '/v1',
    models: [
      { label: 'MiMo v2 Flash', value: 'mimo-v2-flash' },
      { label: 'MiMo v2 Pro', value: 'mimo-v2-pro' },
      { label: 'MiMo v2.5 Pro', value: 'mimo-v2.5-pro' },
    ],
    defaultModel: 'mimo-v2-flash',
    apiKeyPlaceholder: 'API Key',
    requiresKey: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai',
    apiPath: '/api/v1',
    models: [
      { label: 'GPT-4o Mini', value: 'openai/gpt-4o-mini' },
      { label: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash' },
      { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4-5' },
      { label: 'DeepSeek Chat', value: 'deepseek/deepseek-chat' },
    ],
    defaultModel: 'openai/gpt-4o-mini',
    apiKeyPlaceholder: 'sk-or-...',
    requiresKey: true,
  },
  {
    id: 'volcengine',
    label: '火山引擎 (方舟)',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    apiPath: '/api/v3',
    models: [{ label: 'Doubao Seed 1.6', value: 'doubao-seed-1-6-251015' }],
    defaultModel: 'doubao-seed-1-6-251015',
    apiKeyPlaceholder: 'API Key',
    requiresKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434',
    apiPath: '/v1',
    models: [],
    defaultModel: 'llama3',
    apiKeyPlaceholder: '',
    requiresKey: false,
  },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export const MODEL_OPTIONS: Record<string, { label: string; value: string }[]> =
  Object.fromEntries(PROVIDERS.map((p) => [p.id, p.models]));

export const DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.defaultModel]),
);

export const BASE_URL_PLACEHOLDERS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.baseUrl]),
);

export const API_PATHS: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.apiPath]),
);

export const DEFAULT_GLOSS_PROMPT_TEMPLATE = `你是一个学术论文词汇助手。

{domainLine}

用户在阅读以下英文学术论文时遇到了不认识的单词：
{sentenceLine}单词："{word}"

请给出这个单词在当前学术语境下最准确的{language}释义。
要求：
1. 释义简短（2-6 个字），适合标注在单词上方
2. 优先给出该学科领域内的专业含义
3. 不要添加括号里的学科标签或解释，例如不要输出"动态(心理)"
4. 只输出释义本身，不要任何解释或额外文字`;

export const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = `你是一个学术论文翻译助手。

{domainLine}

请将以下英文学术文本准确翻译成{language}。
要求：
1. 保持学术语气，术语翻译准确
2. 不要解释，不要添加原文没有的信息
3. 只输出译文

原文：
{text}`;

export function createDefaultSettings(): Settings {
  return {
    ai: {
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-haiku-4-5',
      baseUrl: '',
      glossPromptTemplate: DEFAULT_GLOSS_PROMPT_TEMPLATE,
      translationPromptTemplate: DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
    },
    glossing: {
      defaultDomain: 'auto',
      language: 'zh',
      autoGlossAllOccurrences: true,
    },
    display: {
      annotationFontSize: '18px',
      annotationColor: 'red',
      annotationOpacity: '100',
      translationFontSize: '18px',
      translationColor: 'red',
      translationOpacity: '100',
    },
    reader: {
      defaultZoom: 'fit-width',
      scrollDirection: 'vertical',
      spreadMode: 'none',
      pageGap: 12,
      theme: 'light',
    },
    shortcuts: {
      gloss: DEFAULT_GLOSS_SHORTCUT,
      find: DEFAULT_FIND_SHORTCUT,
      zoomIn: DEFAULT_ZOOM_IN_SHORTCUT,
      zoomOut: DEFAULT_ZOOM_OUT_SHORTCUT,
      rotateClockwise: DEFAULT_ROTATE_CW_SHORTCUT,
      rotateCounterclockwise: DEFAULT_ROTATE_CCW_SHORTCUT,
      highlight: DEFAULT_HIGHLIGHT_SHORTCUT,
      underline: DEFAULT_UNDERLINE_SHORTCUT,
      strikeout: DEFAULT_STRIKEOUT_SHORTCUT,
      squiggly: DEFAULT_SQUIGGLY_SHORTCUT,
    },
  };
}

const STORAGE_KEY = 'glossreader-settings';

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const defaults = createDefaultSettings();
      return {
        ai: { ...defaults.ai, ...parsed.ai },
        glossing: {
          defaultDomain:
            parsed.glossing?.defaultDomain ?? defaults.glossing.defaultDomain,
          language: parsed.glossing?.language ?? defaults.glossing.language,
          autoGlossAllOccurrences:
            parsed.glossing?.autoGlossAllOccurrences ??
            defaults.glossing.autoGlossAllOccurrences,
        },
        display: { ...defaults.display, ...parsed.display },
        reader: { ...defaults.reader, ...parsed.reader },
        shortcuts: { ...defaults.shortcuts, ...parsed.shortcuts },
      };
    }
  } catch {
    // ignore parse errors
  }
  return createDefaultSettings();
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
