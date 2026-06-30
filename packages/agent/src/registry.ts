import { SkillRegistry } from "@felixos/skills";

import { DocNoteCaptureSkill } from "./skills/doc-note-capture.js";
import { YouTubeCaptureSkill } from "./skills/youtube-capture.js";

export const defaultRegistry = new SkillRegistry();

defaultRegistry.register(DocNoteCaptureSkill);
defaultRegistry.register(YouTubeCaptureSkill);
