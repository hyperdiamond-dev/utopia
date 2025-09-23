// src/services/passwordGenerator.ts
import generator from "generate-password";

export class PasswordGenerator {
  static generate(): string {
    return generator.generate({
      length: 12,
      numbers: true,
      symbols: false,
      uppercase: true,
      lowercase: true,
      excludeSimilarCharacters: true,
      strict: true,
    });
  }
}
