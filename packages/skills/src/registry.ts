import type { SkillDescriptor } from "@felixos/shared-types";

import type { Skill } from "./skill.js";

const skillNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class SkillRegistry {
  readonly #skills = new Map<string, Skill<unknown, unknown>>();

  register(skill: Skill<unknown, unknown>): void {
    validateDescriptor(skill.descriptor);

    const { name } = skill.descriptor;
    if (this.#skills.has(name)) {
      throw new Error(`Skill "${name}" is already registered`);
    }

    this.#skills.set(name, skill);
  }

  get(name: string): Skill<unknown, unknown> | undefined {
    return this.#skills.get(name);
  }

  listDescriptors(): SkillDescriptor[] {
    return [...this.#skills.values()].map((skill) => skill.descriptor);
  }
}

export function isSkillNameSlug(name: string): boolean {
  return skillNamePattern.test(name);
}

function validateDescriptor(descriptor: SkillDescriptor): void {
  if (!isSkillNameSlug(descriptor.name)) {
    throw new Error("Skill name must be a lowercase hyphenated slug");
  }

  if (descriptor.purpose.trim().length === 0) {
    throw new Error(`Skill "${descriptor.name}" must declare a purpose`);
  }

  if (descriptor.triggers.length === 0) {
    throw new Error(`Skill "${descriptor.name}" must declare at least one trigger`);
  }
}
