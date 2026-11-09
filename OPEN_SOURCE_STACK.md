# ZYQMORA AI — Open-source AI stack

The first integrated runtime is local inference: no paid model-provider account and no external API key are required for local model use. The application server talks to Ollama over its private local/container network interface.

## Integrated components

| Component | Source | Purpose | License / notes |
| --- | --- | --- | --- |
| Ollama | https://github.com/ollama/ollama | Runs downloaded open-weight models on a computer/server | MIT project; local inference does not require an Ollama cloud API key |
| Qwen2.5-Coder | https://ollama.com/library/qwen2.5-coder | Default code model, selected as qwen2.5-coder:7b | Model card lists Apache 2.0; model weights must be downloaded to the host |
| Express | https://github.com/expressjs/express | Private backend routes and model proxy | MIT |
| Firebase Admin SDK | https://github.com/firebase/firebase-admin-node | Verify Firebase ID tokens before allowing AI usage | Apache-2.0 |

## Optional open-source project to study

- bolt.diy: https://github.com/stackblitz-labs/bolt.diy
  - MIT-licensed browser-based AI app builder.
  - Supports Ollama and several other model providers.
  - Not copied wholesale into this repository: it is a separate, large React Router/WebContainer application with its own dependency and runtime requirements. ZYQMORA currently uses its own Firebase app and a smaller isolated website-generation flow. We can selectively adopt editor, file-system and agent features later while preserving this app.

## Local model choices

- qwen2.5-coder:3b — lighter download (about 1.9 GB); lower hardware demand, weaker output.
- qwen2.5-coder:7b — default (about 4.7 GB); better quality, needs more memory.
- qwen2.5-coder:14b / 32b — stronger but much heavier; use only on a machine with sufficient RAM/VRAM.

Model sizes are approximate and may change with quantization/tag updates. The host also needs memory for Ollama and the operating system.

## Important distinction

The local Ollama HTTP interface is an internal connection from the ZYQMORA backend to the model runner. It is not a paid third-party API and does not require an external API key. GitHub stores the source code; it does not run inference or provide free compute.

Firebase Hosting serves the frontend only. A machine or server that runs Ollama and the ZYQMORA backend must stay online for the public AI chat to work. A completely free, unlimited, always-on model host cannot be promised.
