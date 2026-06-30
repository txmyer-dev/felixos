import { rawSources, runWithTenantContext } from "@felixos/db";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import type { Skill, SkillContext } from "@felixos/skills";

const execFileAsync = promisify(execFile);

export class ExternalDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalDependencyError";
  }
}

export type YouTubeCaptureInput = {
  youtubeUrl: string;
  entityId?: string;
};

export type YouTubeCaptureOutput = {
  sourceId: string;
  tenantId: string;
  videoId: string;
};

export const YouTubeCaptureSkill: Skill<YouTubeCaptureInput, YouTubeCaptureOutput> = {
  descriptor: {
    name: "youtube-capture",
    purpose:
      "Capture a YouTube video transcript into the knowledge base. USE WHEN given a YouTube URL to ingest.",
    triggers: ["capture youtube", "ingest youtube", "transcribe youtube", "save youtube video"],
    kind: "capture",
    inputSchema: {
      type: "object",
      properties: {
        youtubeUrl: { type: "string" },
        entityId: { type: "string" }
      },
      required: ["youtubeUrl"]
    },
    sideEffectClass: "write",
    defaultRung: "act-and-log",
    requiresInference: true
  },

  async execute(input: YouTubeCaptureInput, ctx: SkillContext): Promise<YouTubeCaptureOutput> {
    const videoId = extractVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new Error(`YouTubeCaptureSkill: cannot parse video ID from URL: ${input.youtubeUrl}`);
    }

    const transcript = await extractTranscript(input.youtubeUrl);

    const id = randomUUID();
    await runWithTenantContext(ctx.tenantId, () =>
      ctx.scopedDb.transaction((tx) =>
        tx.insert(rawSources).values({
          id,
          tenantId: ctx.tenantId,
          ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
          sourceType: "youtube",
          content: transcript,
          metadata: { videoId, youtubeUrl: input.youtubeUrl }
        })
      )
    );

    return { sourceId: id, tenantId: ctx.tenantId, videoId };
  }
};

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1);
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

async function extractTranscript(url: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "yt-cap-"));
  try {
    await execFileAsync("yt-dlp", [
      "--skip-download",
      "--write-auto-sub",
      "--sub-format",
      "json3",
      "--sub-langs",
      "en",
      "-o",
      join(tmpDir, "%(id)s"),
      url
    ]);

    const files = await readdir(tmpDir);
    const subFile = files.find((f) => f.endsWith(".json3"));
    if (!subFile) {
      throw new Error("yt-dlp ran but no subtitle file was produced");
    }

    const raw = await readFile(join(tmpDir, subFile), "utf-8");
    return parseJson3Transcript(raw);
  } catch (err) {
    if (isNotFoundError(err)) {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) {
        throw new ExternalDependencyError(
          "yt-dlp is not installed and YOUTUBE_API_KEY is not set. " +
            "Install yt-dlp (pip install yt-dlp) or set YOUTUBE_API_KEY."
        );
      }
      return fetchTranscriptViaDataApi(url);
    }
    throw err;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("ENOENT") || err.message.includes("not found");
}

function parseJson3Transcript(json: string): string {
  try {
    const data = JSON.parse(json) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    const lines: string[] = [];
    for (const event of data.events ?? []) {
      const text = (event.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (text) lines.push(text);
    }
    return lines.join(" ");
  } catch {
    return json;
  }
}

async function fetchTranscriptViaDataApi(url: string): Promise<string> {
  throw new ExternalDependencyError(
    `YouTube Data API transcript extraction not yet implemented. Install yt-dlp to ingest: ${url}`
  );
}
