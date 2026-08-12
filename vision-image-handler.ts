import { mkdir, writeFile, copyFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode-ai/plugin"

/**
 * Image extension mapping: infers the file extension to use when saving an image,
 * based on its MIME type.
 */
const IMAGE_EXTENSION: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
}

/** Directory where images are saved (project-local, ignored by .gitignore, never committed). */
const VISION_TMP_DIR = path.join(".opencode", "tmp", "vision")

/**
 * Cache of saved images: image-content unique key -> saved disk path.
 * experimental.chat.messages.transform fires on every model request,
 * so this cache avoids saving the same image more than once.
 */
const savedImageCache = new Map<string, string>()

/** Generates a unique ID matching the opencode part ID format (prt_ prefix + hex). */
function makePartId(): string {
  return `prt_${Date.now().toString(16).padStart(8, "0")}${Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("")}`
}

/** Converts Windows path backslashes to forward slashes to reduce escaping issues in model-generated JSON. */
function toPortablePath(filepath: string): string {
  return filepath.replace(/\\/g, "/")
}

/**
 * Extracts the bytes from an image file part and saves them to a stable
 * project-local directory, returning the saved disk path.
 * Returns null if extraction fails.
 *
 * Supports two url forms:
 * - data: protocol: base64-encoded image data (the usual form for pasted images)
 * - file: protocol: local file (copied directly to guard against the system
 *   cleaning up the source temp file)
 */
async function saveImagePart(
  directory: string,
  part: { url?: string; mime?: string },
): Promise<string | null> {
  const url = part.url ?? ""
  const extension = IMAGE_EXTENSION[part.mime ?? ""] ?? ".png"
  const cacheKey = `${url}|${part.mime ?? ""}`

  // Reuse an already-saved file for identical image content, avoiding duplicate saves
  const cached = savedImageCache.get(cacheKey)
  if (cached) return cached

  const dir = path.join(directory, VISION_TMP_DIR)
  await mkdir(dir, { recursive: true })
  const filepath = path.join(dir, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extension}`)

  try {
    if (url.startsWith("data:")) {
      const commaIndex = url.indexOf(",")
      if (commaIndex === -1) return null
      const buffer = Buffer.from(url.slice(commaIndex + 1), "base64")
      if (buffer.length === 0) return null
      await writeFile(filepath, buffer)
    } else if (url.startsWith("file:")) {
      await copyFile(fileURLToPath(url), filepath)
    } else {
      // Forms like http that cannot be fetched locally are discarded
      return null
    }
    savedImageCache.set(cacheKey, filepath)
    return filepath
  } catch {
    return null
  }
}

/**
 * The vision-image-handler plugin:
 * solves the "main model has no vision but the user pasted an image" problem.
 *
 * Before a message is actually sent to the model (experimental.chat.messages.transform),
 * it detects image file parts in the user message:
 * 1. Saves the image bytes to a disk file under the project-local .opencode/tmp/vision/;
 * 2. Replaces the image part with a text part that instructs the main model to call the
 *    vision subagent to read that file path and analyze the image.
 *
 * This way the main model never receives image input it cannot understand, and still
 * gets an actionable image path.
 */
export const VisionImageHandler: Plugin = async ({ directory }) => {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      for (const message of output.messages) {
        // Only process image attachments in user messages; leave assistant messages and subagent sessions untouched
        if (message.info.role !== "user") continue

        const nextParts: typeof message.parts = []
        for (const part of message.parts) {
          if (part.type !== "file" || !part.mime?.startsWith("image/")) {
            nextParts.push(part)
            continue
          }

          const filepath = await saveImagePart(directory, part)
          const text = filepath
            ? `The user pasted an image (${part.mime}${part.filename ? `, file name ${part.filename}` : ""}). ` +
              `The current main model has no vision capability and cannot view the image directly. ` +
              `Please use the task tool to call the vision subagent (subagent_type="vision"), ` +
              `pass the full image path "${toPortablePath(filepath)}" in the task description and ask it to analyze the image, ` +
              `then integrate the analysis result into your answer, written in the same language as the user's message.`
            : `[The user pasted an image (${part.mime}), but it could not be saved as a local file. Ask the user for the image file path, then delegate analysis to the vision subagent.]`

          // Replace the image part with text guidance so the main model gets an actionable path and delegation instruction
          nextParts.push({
            id: makePartId(),
            sessionID: message.info.sessionID,
            messageID: message.info.id,
            type: "text",
            synthetic: true,
            text,
          })
        }
        message.parts = nextParts
      }
    },
  }
}
