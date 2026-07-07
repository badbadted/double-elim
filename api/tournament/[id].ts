/**
 * Tournament storage API (Vercel serverless + Upstash Redis / "Vercel KV").
 *
 * One-writer / many-reader model:
 *   GET  /api/tournament/:id  -> public read (viewers poll this)
 *   PUT  /api/tournament/:id  -> write, requires the matching editToken
 *
 * The KV credentials live only here (server side); the browser never sees them.
 * The first PUT for an id establishes its editToken; later writes must match,
 * so only the admin device (which holds the token) can mutate the bracket.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

/** Lazily build the client so a missing KV binding returns a clean 500. */
function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing)');
  return new Redis({ url, token });
}

interface Stored {
  data: unknown;
  editToken: string;
  rev: number;
  updatedAt: number;
}

const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? '');
  if (!ID_RE.test(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const key = `de:tournament:${id}`;

  try {
    const redis = getRedis();
    if (req.method === 'GET') {
      const stored = await redis.get<Stored>(key);
      if (!stored) return res.status(404).json({ error: 'not found' });
      // Never leak the editToken to readers.
      return res.status(200).json({ data: stored.data, rev: stored.rev, updatedAt: stored.updatedAt });
    }

    if (req.method === 'PUT') {
      const body = (req.body ?? {}) as { data?: unknown; editToken?: unknown };
      const { data } = body;
      const editToken = body.editToken;
      if (data == null || typeof editToken !== 'string' || editToken.length < 8) {
        return res.status(400).json({ error: 'missing data or editToken' });
      }
      const existing = await redis.get<Stored>(key);
      if (existing && existing.editToken !== editToken) {
        return res.status(403).json({ error: 'not the owner of this tournament' });
      }
      const rev = (existing?.rev ?? 0) + 1;
      const next: Stored = { data, editToken, rev, updatedAt: Date.now() };
      await redis.set(key, next);
      return res.status(200).json({ rev, updatedAt: next.updatedAt });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'storage error', detail: String(err) });
  }
}
