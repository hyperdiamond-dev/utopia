/**
 * Content Routes
 * API endpoints for module/submodule media content
 */

import { Hono } from "hono";
import { moduleContentRepository } from "../db/moduleContent.ts";
import { authMiddleware } from "../middleware/auth.ts";

type Variables = {
  userId: number;
  userUuid: string;
  friendlyAlias: string;
};

const content = new Hono<{ Variables: Variables }>();

// Get content for a module
content.get("/module/:moduleId", authMiddleware, async (c) => {
  const moduleId = parseInt(c.req.param("moduleId"), 10);
  if (isNaN(moduleId)) {
    return c.json({ error: "Invalid module ID" }, 400);
  }

  const items = await moduleContentRepository.getContentByModuleId(moduleId);
  return c.json({ content: items });
});

// Get content for a submodule
content.get("/submodule/:submoduleId", authMiddleware, async (c) => {
  const submoduleId = parseInt(c.req.param("submoduleId"), 10);
  if (isNaN(submoduleId)) {
    return c.json({ error: "Invalid submodule ID" }, 400);
  }

  const items = await moduleContentRepository.getContentBySubmoduleId(
    submoduleId,
  );
  return c.json({ content: items });
});

// Create content (admin use)
content.post("/", authMiddleware, async (c) => {
  const adminSecret = c.req.header("x-admin-secret");
  if (!adminSecret || adminSecret !== Deno.env.get("ADMIN_SECRET")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json();

  const {
    module_id,
    submodule_id,
    content_type,
    title,
    description,
    url,
    thumbnail_url,
    duration_seconds,
    sequence_order,
    is_external,
    metadata,
  } = body;

  // Validate required fields
  if (!content_type || !url) {
    return c.json({ error: "content_type and url are required" }, 400);
  }

  if (!module_id && !submodule_id) {
    return c.json(
      { error: "Either module_id or submodule_id is required" },
      400,
    );
  }

  const validTypes = ["video", "image", "audio"];
  if (!validTypes.includes(content_type)) {
    return c.json(
      { error: `content_type must be one of: ${validTypes.join(", ")}` },
      400,
    );
  }

  const item = await moduleContentRepository.createContent({
    module_id: module_id || null,
    submodule_id: submodule_id || null,
    content_type,
    title: title || null,
    description: description || null,
    url,
    thumbnail_url: thumbnail_url || null,
    duration_seconds: duration_seconds || null,
    sequence_order: sequence_order ?? 0,
    is_active: true,
    is_external: is_external ?? false,
    metadata: metadata || {},
  });

  return c.json({ content: item }, 201);
});

// Delete content (admin use)
content.delete("/:id", authMiddleware, async (c) => {
  const adminSecret = c.req.header("x-admin-secret");
  if (!adminSecret || adminSecret !== Deno.env.get("ADMIN_SECRET")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid content ID" }, 400);
  }

  const deleted = await moduleContentRepository.deleteContent(id);
  if (!deleted) {
    return c.json({ error: "Content not found" }, 404);
  }

  return c.json({ success: true });
});

export { content };
