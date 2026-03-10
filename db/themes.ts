import { sql } from "./connection.ts";

export interface Theme {
  id: number;
  name: string;
  label: string;
  css_vars: Record<string, string>;
  effects: string;
  body_class: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class ThemeRepository {
  async getAllActiveThemes(): Promise<Theme[]> {
    const result = await sql`
      SELECT * FROM terminal_utopia.themes
      WHERE is_active = true
      ORDER BY name ASC
    `;
    return result as Theme[];
  }

  async getThemeByName(name: string): Promise<Theme | null> {
    const result = await sql`
      SELECT * FROM terminal_utopia.themes
      WHERE name = ${name} AND is_active = true
    `;
    return (result[0] as Theme) ?? null;
  }
}

export const themeRepository = new ThemeRepository();
