import { SkillRegistry } from "@felixos/skills";

import { CreateTaskSkill } from "./skills/create-task.js";
import { DocNoteCaptureSkill } from "./skills/doc-note-capture.js";
import { DraftEmailSkill } from "./skills/draft-email.js";
import { YouTubeCaptureSkill } from "./skills/youtube-capture.js";

export const defaultRegistry = new SkillRegistry();

defaultRegistry.register(DocNoteCaptureSkill);
defaultRegistry.register(YouTubeCaptureSkill);
defaultRegistry.register(DraftEmailSkill);
defaultRegistry.register(CreateTaskSkill);
