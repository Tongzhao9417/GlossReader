import {
  DEFAULT_FIND_SHORTCUT,
  DEFAULT_GLOSS_SHORTCUT,
} from './keyboardShortcuts';

export interface Settings {
  ai: {
    provider: 'anthropic' | 'openai' | 'deepseek' | 'ollama';
    apiKey: string;
    model: string;
    baseUrl: string;
    glossPromptTemplate: string;
    translationPromptTemplate: string;
  };
  glossing: {
    defaultDomain: string;
    language: string;
  };
  display: {
    annotationFontSize: string;
    annotationColor: string;
    annotationOpacity: string;
    translationFontSize: string;
    translationColor: string;
    translationOpacity: string;
  };
  shortcuts: {
    gloss: string;
    find: string;
  };
}

export const MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
  ],
  openai: [
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
  ],
  deepseek: [
    { label: 'DeepSeek V4 Flash', value: 'deepseek-v4-flash' },
    { label: 'DeepSeek V4 Pro', value: 'deepseek-v4-pro' },
  ],
};

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-v4-flash',
  ollama: 'llama3',
};

export const BASE_URL_PLACEHOLDERS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  deepseek: 'https://api.deepseek.com',
  ollama: 'http://localhost:11434',
};

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
    },
    display: {
      annotationFontSize: '18px',
      annotationColor: 'red',
      annotationOpacity: '100',
      translationFontSize: '18px',
      translationColor: 'red',
      translationOpacity: '100',
    },
    shortcuts: {
      gloss: DEFAULT_GLOSS_SHORTCUT,
      find: DEFAULT_FIND_SHORTCUT,
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
        },
        display: { ...defaults.display, ...parsed.display },
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
