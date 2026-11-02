# Avatar moderation

The API screens every uploaded profile picture before it stores it. A picture that
no screening layer can check is refused, never stored unchecked.

## Layers

| Order | Layer                            | Where it runs                                                        | Verdict                                                      |
| ----- | -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1     | OpenAI `omni-moderation-latest`  | OpenAI's API, over HTTPS                                             | `nsfw` when OpenAI flags `sexual` or `violence/graphic`      |
| 2     | Marqo `nsfw-image-detection-384` | A worker thread in the API process, through `onnxruntime-web` (WASM) | `nsfw` when the score is at or above `AVATAR_NSFW_THRESHOLD` |

The API asks layer 1 first. It asks layer 2 only when layer 1 fails: no key, an
error status, a malformed answer, or a timeout.

## Upload responses

| Result             | Status | Body                                    |
| ------------------ | ------ | --------------------------------------- |
| Safe               | 200    | The updated account                     |
| Explicit           | 422    | `{ "error": "nsfw_image" }`             |
| Every layer failed | 503    | `{ "error": "moderation_unavailable" }` |

Outside production, an API with no key and no model stores pictures unscreened, so
local development needs neither. In production the same setup refuses every upload.

## Storage

Migration 051 stores an accepted picture in the `accounts` row itself: `avatar_image`,
`avatar_image_type` and `avatar_image_version`.

- No player-supplied path reaches the file system, and no volume needs to stay in sync.
- Deleting the account deletes the picture.
- `avatar_image_version` changes on every upload, so the public URL can be cached
  immutably.

## Configuration

| Variable                       | Default                              | Purpose                                |
| ------------------------------ | ------------------------------------ | -------------------------------------- |
| `OPENAI_API_KEY`               | unset                                | Turns on layer 1                       |
| `AVATAR_NSFW_MODEL`            | `/models/nsfw.onnx` in the API image | Turns on layer 2                       |
| `AVATAR_NSFW_THRESHOLD`        | `0.7`                                | Layer 2 refusal score, between 0 and 1 |
| `AVATAR_MODERATION_TIMEOUT_MS` | `8000`                               | Time limit for each layer              |

## Why the fallback is built this way

- **WASM, not `onnxruntime-node`.** The native package ships glibc binaries, and the
  API image is alpine (musl). WASM runs on any libc and architecture, including the
  arm64 production host.
- **One thread.** Each API process has a 1.25 CPU limit and also runs live rooms. One
  inference thread keeps screening from taking CPU the rooms need.
- **Started on demand, stopped when idle.** The worker uses about 190 MB while loaded.
  It starts only when layer 1 fails and stops after 60 seconds without work, so it
  costs no memory while OpenAI answers.
- **Model pinned by digest.** `tools/deploy/fetch-nsfw-model.mjs` downloads the ONNX
  export from `ICIJ/nsfw-image-detection-384-onnx` at a fixed revision and fails the
  build if its SHA-256 differs. The model is Apache-2.0. Its labels are
  `["NSFW", "SFW"]`, so index 0 holds the explicit score.
- **The image keeps only the WASM files Node loads.** The Dockerfile deletes the rest
  of `onnxruntime-web/dist` (browser bundles and WebGPU builds), which cuts about 90 MB.

Measured on arm64 with one CPU: about 210 ms for each picture once loaded, and about
1 second to load the model.

## Limits

- OpenAI scores images only for `sexual`, `violence` and `self-harm`. Its
  `sexual/minors` category is text only.
- Non-graphic violence (`violence` without `violence/graphic`) is allowed, so battle
  art and action scenes still pass.
- The local fallback detects only sexual content. While OpenAI is down, graphic
  violence is not screened.
- Do not send known or suspected child sexual abuse material to OpenAI. Its moderation
  endpoint is not a CSAM detector.
- OpenAI may update the model behind `omni-moderation-latest`, which can change its
  verdicts.
