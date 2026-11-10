// Allow-list of Cloudflare Workers AI models used by the prompt-only website builder.
export const AI_MODELS = Object.freeze({
  "gemma-4": { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4", max: 6800 },
  "qwen-coder": { id: "@cf/qwen/qwen2.5-coder-32b-instruct", label: "Qwen Coder", max: 6400 },
  "qwen-3.8": { id: "@cf/qwen/qwen3.8-27b", label: "Qwen 3.8", max: 6800 }
});
export const DEFAULT_AI_MODEL = "gemma-4";
export function selectAIModel(key) {
  return AI_MODELS[typeof key === "string" ? key : ""] || AI_MODELS[DEFAULT_AI_MODEL];
}
export async function runTextModel(ai, model, messages, max) {
  const result = await ai.run(model.id, {
    messages,
    stream: false,
    temperature: 0.42,
    max_completion_tokens: max || model.max
  });
  let output = result?.response ?? result?.choices?.[0]?.message?.content ?? result?.output_text ?? result?.result?.response;
  if (Array.isArray(output)) output = output.map((x) => typeof x === "string" ? x : x?.text || "").join("\n");
  if (typeof output !== "string" || !output.trim()) throw new Error("The selected model returned no text");
  return output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
