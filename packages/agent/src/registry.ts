import { SkillRegistry } from "@felixos/skills";

import { CreateAccountSkill } from "./skills/create-account.js";
import { CreateContactSkill } from "./skills/create-contact.js";
import { CreateTaskSkill } from "./skills/create-task.js";
import { DocNoteCaptureSkill } from "./skills/doc-note-capture.js";
import { DraftEmailSkill } from "./skills/draft-email.js";
import { LogInteractionSkill } from "./skills/log-interaction.js";
import { YouTubeCaptureSkill } from "./skills/youtube-capture.js";

export const defaultRegistry = new SkillRegistry();

defaultRegistry.register(DocNoteCaptureSkill);
defaultRegistry.register(YouTubeCaptureSkill);
defaultRegistry.register(DraftEmailSkill);
defaultRegistry.register(CreateTaskSkill);
defaultRegistry.register(CreateAccountSkill);
defaultRegistry.register(CreateContactSkill);
defaultRegistry.register(LogInteractionSkill);
