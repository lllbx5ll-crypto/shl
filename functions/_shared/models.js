// Multi-provider AI router for ZYQMORA.
// Provider credentials are Cloudflare Pages secrets and never reach the browser.
export const AI_MODELS = Object.freeze({
  "gemma-4": {
    id: "@cf/google/gemma-4-26b-a4b-it",
    label: "Cloudflare Gemma 4",
    max: 6800,
    maxParam: "max_completion_tokens"
  },
  "qwen-coder": {
    id: "@cf/qwen/qwen2.5-coder-32b-instruct",
    label: "Cloudflare Qwen Coder",
    max: 6400,
    maxParam: "max_tokens"
  },
  "qwen-3.8": {
    id: "@cf/qwen/qwen3.8-27b",
    label: "Cloudflare Qwen 3.8",
    max: 6800,
    maxParam: "max_completion_tokens"
  }
});

export const DEFAULT_AI_MODEL = "gemma-4";

const ROUTES = Object.freeze({
  plan: ["openrouter", "gemini", "cloudflare"],
  html: ["groq", "openrouter", "gemini", "cloudflare"],
  css: ["gemini", "groq", "openrouter", "cloudflare"],
  js: ["groq", "openrouter", "gemini", "cloudflare"],
  review: ["gemini", "openrouter", "groq", "cloudflare"]
});

const CLOUD_MODEL_BY_TASK = Object.freeze({
  plan: "gemma-4",
  html: "qwen-coder",
  css: "gemma-4",
  js: "qwen-coder",
  review: "gemma-4"
});

const OPENROUTER_MODEL_BY_TASK = Object.freeze({
  plan: "nvidia/nemotron-3-ultra-550b-a55b:free",
  html: "cohere/north-mini-code:free",
  css: "google/gemma-4-26b-a4b-it:free",
  js: "cohere/north-mini-code:free",
  review: "nvidia/nemotron-3-ultra-550b-a55b:free"
});

function normalizeEnvironment(value) {
  if (value && typeof value === "object" && (value.AI || value.GEMINI_API_KEY || value.GROQ_API_KEY || value.OPENROUTER_API_KEY)) {
    return value;
  }
  if (value && typeof value.run === "function") return { AI: value };
  return value || {};
}

export function getConfiguredAIProviders(value) {
  const env = normalizeEnvironment(value);
  const providers = [];
  if (env.GEMINI_API_KEY) providers.push("Google Gemini");
  if (env.GROQ_API_KEY) providers.push("Groq");
  if (env.OPENROUTER_API_KEY) providers.push("OpenRouter");
  if (env.AI && typeof env.AI.run === "function") providers.push("Cloudflare Workers AI");
  return providers;
}

export function hasAIProvider(value) {
  return getConfiguredAIProviders(value).length > 0;
}

export function selectAIModel(key) {
  return AI_MODELS[typeof key === "string" ? key : ""] || AI_MODELS[DEFAULT_AI_MODEL];
}

function contentText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => typeof part === "string" ? part : part?.text || "").join("\n");
  }
  return "";
}

async function callCloudflare(env, task, messages, maxTokens) {
  if (!env.AI || typeof env.AI.run !== "function") throw new Error("Cloudflare Workers AI is not configured");
  const model = AI_MODELS[CLOUD_MODEL_BY_TASK[task] || DEFAULT_AI_MODEL];
  const options = {
    messages,
    stream: false,
    temperature: 0.35
  };
  options[model.maxParam] = maxTokens || model.max;
  const result = await env.AI.run(model.id, options);
  const output = result?.response
    ?? result?.choices?.[0]?.message?.content
    ?? result?.output_text
    ?? result?.result?.response;
  const text = contentText(output).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) throw new Error("Cloudflare Workers AI returned an empty response");
  return { text, provider: "cloudflare", model: model.id, label: model.label };
}

async function callGemini(env, messages, maxTokens) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = messages.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: String(message.content || "") }]
  }));
  if (!contents.length) throw new Error("Gemini requires a user message");
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens || 5000
    }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Gemini API " + response.status + ": " + (data?.error?.message || "request failed"));
  }
  const text = contentText(data?.candidates?.[0]?.content?.parts).trim();
  if (!text) throw new Error("Gemini returned no text" + (data?.promptFeedback?.blockReason ? " (" + data.promptFeedback.blockReason + ")" : ""));
  return { text, provider: "gemini", model: "gemini-3.8-flash", label: "Gemini 3.8 Flash" };
}

async function callOpenAICompatible({ key, endpoint, model, provider, label, messages, maxTokens, headers = {} }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
      ...headers
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: maxTokens || 4500,
      stream: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || "request failed";
    throw new Error(provider + " API " + response.status + ": " + String(message).slice(0, 240));
  }
  const text = contentText(data?.choices?.[0]?.message?.content ?? data?.output_text).trim();
  if (!text) throw new Error(provider + " returned no text");
  return { text, provider, model, label };
}

async function callGroq(env, task, messages, maxTokens) {
  if (!env.GROQ_API_KEY) throw new Error("Groq is not configured");
  return callOpenAICompatible({
    key: env.GROQ_API_KEY,
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "qwen/qwen3.8-27b",
    provider: "groq",
    label: "Groq Qwen 3.8",
    messages,
    maxTokens,
    headers: { "X-Title": "ZYQMORA AI" }
  });
}

async function callOpenRouter(env, task, messages, maxTokens) {
  if (!env.OPENROUTER_API_KEY) throw new Error("OpenRouter is not configured");
  const model = OPENROUTER_MODEL_BY_TASK[task] || "openrouter/free";
  return callOpenAICompatible({
    key: env.OPENROUTER_API_KEY,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model,
    provider: "openrouter",
    label: "OpenRouter " + model,
    messages,
    maxTokens,
    headers: {
      "HTTP-Referer": "https://zyqmora-ai.pages.dev",
      "X-Title": "ZYQMORA AI"
    }
  });
}

export async function runRoutedTextModel(value, task, messages, maxTokens, options = {}) {
  const env = normalizeEnvironment(value);
  const route = ROUTES[task] || ROUTES.html;
  const excluded = new Set(options.excludeProviders || []);
  const failures = [];

  for (const provider of route) {
    if (excluded.has(provider)) continue;
    try {
      if (provider === "gemini" && env.GEMINI_API_KEY) {
        return await callGemini(env, messages, maxTokens);
      }
      if (provider === "groq" && env.GROQ_API_KEY) {
        return await callGroq(env, task, messages, maxTokens);
      }
      if (provider === "openrouter" && env.OPENROUTER_API_KEY) {
        return await callOpenRouter(env, task, messages, maxTokens);
      }
      if (provider === "cloudflare" && env.AI?.run) {
        return await callCloudflare(env, task, messages, maxTokens);
      }
    } catch (error) {
      const message = String(error?.message || "provider failed").slice(0, 260);
      failures.push(provider + ": " + message);
      console.warn("ZYQMORA AI provider fallback:", provider, message);
    }
  }

  if (!getConfiguredAIProviders(env).length) {
    throw new Error("لم يتم ربط أي محرك ذكاء اصطناعي. اربط Workers AI أو أضف مفاتيح Gemini وGroq وOpenRouter في أسرار Cloudflare.");
  }
  throw new Error("تعذّر تنفيذ مرحلة " + task + " عبر جميع المحركات المتاحة. " + failures.join(" | "));
}

// Backwards-compatible Cloudflare-only helper used by chat and tests.
export async function runTextModel(ai, model, messages, max) {
  const env = normalizeEnvironment(ai);
  const selected = model || selectAIModel(DEFAULT_AI_MODEL);
  const options = { messages, stream: false, temperature: 0.35 };
  options[selected.maxParam || "max_tokens"] = max || selected.max;
  const result = await env.AI.run(selected.id, options);
  const output = result?.response ?? result?.choices?.[0]?.message?.content ?? result?.output_text ?? result?.result?.response;
  const text = contentText(output).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) throw new Error("The selected model returned no text");
  return text;
}
