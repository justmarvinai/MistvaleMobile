import { z } from 'zod';

/**
 * The news feed.
 *
 * Posts are content with a window, so the server hands over only what is up right now and
 * the client never has to decide whether something has started. Pinned posts come first;
 * everything else is newest-first by the day it opened.
 */

export const newsItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  /** Markdown-lite. Rendered as text by the client — never as HTML. */
  body: z.string(),
  pinned: z.boolean(),
  /** ISO instant the post opened, or null for one that has simply always been up. */
  startsAt: z.string().nullable(),
  /** ISO instant it closes, or null for one with no end. */
  endsAt: z.string().nullable(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

export const newsViewSchema = z.object({
  posts: z.array(newsItemSchema),
});
export type NewsView = z.infer<typeof newsViewSchema>;
