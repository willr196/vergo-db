/**
 * Just enough of Fastify's route API for the desktop tool's route files to run
 * inside this Express app unchanged: app.get/post/patch/delete with
 * (request, reply) handlers whose return value is the JSON response, and
 * reply.code(n).send(body). Keeping the routes as they were written is what
 * keeps VERGO Scheduling behaving exactly like the desktop tool.
 *
 * Auth is not here: the whole router sits behind adminAuth (session + CSRF),
 * so the routes' own requireAdmin hook is a no-op.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { CostingError } from './costing';

export interface FastifyRequest {
  body: unknown;
  query: unknown;
  params: unknown;
  log: { error: (...args: unknown[]) => void };
}

export interface FastifyReply {
  code(status: number): FastifyReply;
  send(body?: unknown): FastifyReply;
}

type Handler = (request: FastifyRequest, reply: FastifyReply) => unknown;

export interface FastifyInstance {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
  patch(path: string, handler: Handler): void;
  delete(path: string, handler: Handler): void;
  addHook(name: 'preHandler', hook: unknown): void;
}

/** The desktop routes' guard. Auth already happened at the router. */
export async function requireAdmin() {}

/** The desktop app's error handler, word for word in what it sends back. */
export function sendError(error: unknown, res: Response) {
  if (error instanceof CostingError) {
    return res.status(error.httpStatus).json({ error: error.message, code: error.code });
  }
  const err = error as { code?: string; statusCode?: number; message?: string };
  if (err.code === 'P2002' || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
    return res.status(409).json({ error: 'That already exists' });
  }
  console.error('[SCHEDULING]', error);
  const status = err.statusCode ?? 500;
  return res.status(status).json({ error: status < 500 ? (err.message ?? 'Bad request') : 'Something went wrong' });
}

/**
 * Mount a desktop route module on an Express router. Paths are written as the
 * desktop had them ('/api/jobs/:id'); `prefix` ('/api') is stripped so they
 * sit under wherever the router is mounted.
 */
export function mountFastifyRoutes(router: Router, register: (app: FastifyInstance) => Promise<void> | void, prefix = '/api') {
  const add = (method: 'get' | 'post' | 'patch' | 'delete') => (path: string, handler: Handler) => {
    const local = path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path;
    router[method](local, async (req: Request, res: Response, _next: NextFunction) => {
      let status = 200;
      let sent = false;
      const reply: FastifyReply = {
        code(n) { status = n; return reply; },
        send(body) {
          sent = true;
          if (body === undefined) res.status(status).end();
          else res.status(status).json(body);
          return reply;
        },
      };
      const request: FastifyRequest = {
        body: req.body ?? {},
        query: req.query,
        params: req.params,
        log: { error: (...args) => console.error('[SCHEDULING]', ...args) },
      };
      try {
        const result = await handler(request, reply);
        if (!sent && !res.headersSent) {
          if (result === undefined) res.status(status === 200 ? 204 : status).end();
          else res.status(status).json(result);
        }
      } catch (error) {
        if (!res.headersSent) sendError(error, res);
      }
    });
  };
  const app: FastifyInstance = {
    get: add('get'), post: add('post'), patch: add('patch'), delete: add('delete'),
    addHook: () => {},
  };
  return register(app);
}
