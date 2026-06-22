import { isTauri } from "@tauri-apps/api/core";
import {
  type Settings,
  API_PATHS,
  BASE_URL_PLACEHOLDERS,
  DEFAULT_GLOSS_PROMPT_TEMPLATE,
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
  getProvider,
} from "./settings";

export interface GlossResult {
  word: string;
  definition: string;
}

export interface TranslationResult {
  sourceText: string;
  translation: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  auto: "",
  psychology: "心理学",
  "cognitive-neuroscience": "认知神经科学",
  "computer-science": "计算机科学",
  medicine: "医学",
  economics: "经济学",
  statistics: "统计学",
};

const LANGUAGE_LABELS: Record<string, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
};

function buildPrompt(
  word: string,
  sentence: string,
  settings: Settings,
): string {
  const lang = LANGUAGE_LABELS[settings.glossing.language] ?? "中文";
  const domain = DOMAIN_LABELS[settings.glossing.defaultDomain];
  const template =
    settings.ai.glossPromptTemplate.trim() || DEFAULT_GLOSS_PROMPT_TEMPLATE;

  return renderPromptTemplate(template, {
    word,
    sentence,
    sentenceLine: sentence ? `句子："${sentence}"\n` : "",
    text: word,
    language: lang,
    domain: domain ?? "",
    domainLine: domain ? `论文领域：${domain}` : "",
  });
}

function buildTranslationPrompt(text: string, settings: Settings): string {
  const lang = LANGUAGE_LABELS[settings.glossing.language] ?? "中文";
  const domain = DOMAIN_LABELS[settings.glossing.defaultDomain];
  const template =
    settings.ai.translationPromptTemplate.trim() ||
    DEFAULT_TRANSLATION_PROMPT_TEMPLATE;

  return renderPromptTemplate(template, {
    word: text,
    sentence: text,
    sentenceLine: text ? `句子："${text}"\n` : "",
    text,
    language: lang,
    domain: domain ?? "",
    domainLine: domain ? `论文领域：${domain}` : "",
  });
}

function renderPromptTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}

function getBaseUrl(settings: Settings): string {
  if (settings.ai.baseUrl) {
    return settings.ai.baseUrl.replace(/\/+$/, "");
  }
  return BASE_URL_PLACEHOLDERS[settings.ai.provider] ?? "";
}

function getProxyPrefix(provider: string): string {
  // Dev-only: mirrors the proxy entries in vite.config.ts. Ollama talks to
  // localhost directly, so it has no proxy prefix.
  if (provider === "ollama") return "";
  return `/api/${provider}`;
}

async function requestCompletion(
  prompt: string,
  settings: Settings,
): Promise<string> {
  const { provider, apiKey, model } = settings.ai;

  if (getProvider(provider)?.requiresKey !== false && !apiKey) {
    throw new Error("请先在设置中填写 API Key");
  }

  const baseUrl = getBaseUrl(settings);
  const apiPath = API_PATHS[provider] ?? "/v1";
  const inTauri = isTauri();

  let url: string;
  if (provider === "ollama") {
    url = `${baseUrl || "http://localhost:11434"}${apiPath}/chat/completions`;
  } else if (inTauri) {
    url = `${baseUrl}${apiPath}/chat/completions`;
  } else {
    url = `${getProxyPrefix(provider)}${apiPath}/chat/completions`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (provider === "openrouter") {
    // Optional attribution headers for OpenRouter's dashboard/leaderboard.
    headers["HTTP-Referer"] = "https://github.com/Tongzhao9417/GlossReader";
    headers["X-Title"] = "GlossReader";
  }

  const body = {
    model,
    messages: [{ role: "user" as const, content: prompt }],
    max_tokens: 256,
    temperature: 0.3,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API 请求失败 (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  return message?.content?.trim() || "";
}

export async function fetchGloss(
  word: string,
  sentence: string,
  settings: Settings,
): Promise<GlossResult> {
  const definition =
    (await requestCompletion(buildPrompt(word, sentence, settings), settings)) ||
    "无法获取释义";

  return { word, definition };
}

export async function fetchTranslation(
  sourceText: string,
  settings: Settings,
): Promise<TranslationResult> {
  const translation =
    (await requestCompletion(
      buildTranslationPrompt(sourceText, settings),
      settings,
    )) || "无法获取翻译";

  return { sourceText, translation };
}
