# AI model and voice

## Model: InferHub (DeepSeek)
- InferHub's API works like the OpenAI API. Point any OpenAI-compatible client at it.
- Base URL: `https://api.inferhub.dev/v1`
- Chat endpoint: `POST /v1/chat/completions` (supports tool/function calling for the actions in CHAT_TOOLS.md)
- Auth: header `Authorization: Bearer $INFERHUB_API_KEY` (also accepts `x-api-key`)
- Key: read it from the environment variable `INFERHUB_API_KEY` on the dev machine (a local `.env`, which is gitignored). Never commit it, log it, or send it to the browser. Calls go through a server-side route.
- DeepSeek models on InferHub (checked 2026-10-19; confirm with `GET /v1/models`):
  - `deepseek/deepseek-v4-flash`: fast and cheap. Default for chat and tool calls.
  - `deepseek/deepseek-v4.1-flash` and `deepseek/deepseek-v4.1-flash-fast`: newer flash versions.
  - `deepseek/deepseek-v4-pro`: stronger reasoning, for harder multi-step questions.
- Response headers worth logging: `x-inferhub-request-id`, `x-inferhub-model`, `x-ratelimit-remaining`.
- Limits: 500 inference requests per minute per account.
- Docs: https://inferhub.dev/docs/api and the spec at https://inferhub.dev/api/openapi.json

## Voice (F7)
Talk to the map agent instead of typing.
- Push-to-talk mic button next to the chat box.
- Speech to text turns the question into text, which goes to the same chat flow (same actions, same rule against made-up numbers).
- Text to speech reads back a short spoken version of the answer (the number and the place) while the map flies to it.
- A transcript appears in the chat, so voice and text history stay together.
- Acceptance checks:
  - [ ] Saying each of the 5 questions in CHAT_TOOLS.md gives the same answer as typing it.
  - [ ] The spoken reply starts within about 2 seconds after the text answer arrives.
  - [ ] The map moves to match a spoken question.
  - [ ] If the mic is blocked, typing still works and a clear message explains why.

## Demo addition
Ask aloud: "Hey, where's the loudest block in Bushwick on Saturday nights?" The agent answers out loud and the 3D map flies there.
