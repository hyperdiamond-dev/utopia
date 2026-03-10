import { Hono } from "hono";
import { themeRepository } from "../db/index.ts";

export const themes = new Hono();

/**
 * GET /themes - Get all active themes
 * Public endpoint (no auth required) - Terminal needs this for rendering
 */
themes.get("/", async (c) => {
  try {
    const allThemes = await themeRepository.getAllActiveThemes();
    return c.json({ themes: allThemes });
  } catch (error) {
    console.error("Failed to get themes:", error);
    return c.json({ error: "Failed to get themes" }, 500);
  }
});

/**
 * GET /themes/:name - Get a single theme by name
 * Public endpoint (no auth required)
 */
themes.get("/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const theme = await themeRepository.getThemeByName(name);

    if (!theme) {
      return c.json({ error: "Theme not found" }, 404);
    }

    return c.json({ theme });
  } catch (error) {
    console.error("Failed to get theme:", error);
    return c.json({ error: "Failed to get theme" }, 500);
  }
});
