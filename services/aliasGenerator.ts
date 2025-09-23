// src/services/aliasGenerator.ts
import {
  adjectives,
  animals,
  Config,
  uniqueNamesGenerator,
} from "unique-names-generator";

export class AliasGenerator {
  private static readonly config: Config = {
    dictionaries: [adjectives, animals],
    separator: "",
    style: "capital",
    length: 2,
  };

  static generate(): string {
    const baseName = uniqueNamesGenerator(this.config);
    const suffix = Math.floor(Math.random() * 999) + 1;
    return `${baseName}${suffix}`;
  }

  static async generateUnique(
    checkExists: (alias: string) => Promise<boolean>,
    maxAttempts = 10,
  ): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      const alias = this.generate();
      if (!(await checkExists(alias))) {
        return alias;
      }
    }
    // Fallback with timestamp
    return `${this.generate()}${Date.now().toString().slice(-4)}`;
  }
}
