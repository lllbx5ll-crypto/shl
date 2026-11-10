// Workers AI allow-list: no arbitrary user-supplied model identifiers.
export const AI_MODELS = Object.freeze({
  "gemma-4": { id: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4", newApi: true, max: 6800 },
  "qwen-coder": { id: "@cf/qwen/qwen2.5-coder-32b-instruct", label: "Qwen Coder", newApi: false, max: 6400 },
  "qwen-3.8": { id: "@cf/qwen/qwen3.8-27b", label: "Qwen 3.8", newApi: true, max: 6800 }
});
export const DEFAULT_AI_MODEL = "gemma-4";
export function selectAIModel(key) {
  return AI_MODELS[typeof key === "string" ? key : ""] || AI_MODELS[DEFAULT_AI_MODEL];
}
export async function runTextModel(ai, model, messages, max) {
  const options = { messages, stream: false, temperature: 0.48 };
  if (model.newApi) options.max_completion_tokens = max || model.max;
  else { options.max_tokens = max || model.max; options.top_p = 0.9; }
  const result = await ai.run(model.id, options);
  let output = result?.response ?? result?.choices?.[0]?.message?.content ?? result?.output_text ?? result?.result?.response;
  if (Array.isArray(output)) output = output.map((x) => typeof x === "string" ? x : x?.text || "").join("\n");
  if (typeof output !== "string" || !output.trim()) throw new Error("Empty model result");
  return output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
