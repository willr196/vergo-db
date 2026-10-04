import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const clock = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:MM');
export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());
export const money = z.number().min(0).max(100000);

export const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** Run a handler, turning zod errors and errors with a statusCode into JSON. */
export function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const first = error.issues[0];
        return res.status(400).json({ ok: false, error: `${first.path.join('.') || 'input'}: ${first.message}`, issues: error.issues });
      }
      if (error?.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message, ...(error.extra ?? {}) });
      if (error?.code === 'P2025') return res.status(404).json({ ok: false, error: 'Not found' });
      next(error);
    }
  };
}

export function fail(statusCode: number, message: string, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { statusCode, extra });
}

export function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);
}
