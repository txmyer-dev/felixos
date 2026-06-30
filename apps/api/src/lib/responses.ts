import type { FastifyReply } from "fastify";

type ApiErrorCode =
  "bad_request" | "unauthorized" | "not_found" | "conflict" | "llm_error" | "agent_error";

export function sendSuccess<T>(reply: FastifyReply, data: T): Promise<void> {
  return reply.send({ ok: true, data }) as unknown as Promise<void>;
}

export function sendCreated<T>(reply: FastifyReply, data: T): Promise<void> {
  return reply.status(201).send({ ok: true, data }) as unknown as Promise<void>;
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string
): Promise<void> {
  return reply
    .status(status)
    .send({ ok: false, error: { code, message } }) as unknown as Promise<void>;
}

export function sendBadRequest(reply: FastifyReply, message: string): Promise<void> {
  return sendError(reply, 400, "bad_request", message);
}

export function sendNotFound(reply: FastifyReply, message: string): Promise<void> {
  return sendError(reply, 404, "not_found", message);
}

export function sendUnauthorized(reply: FastifyReply, message: string): Promise<void> {
  return sendError(reply, 401, "unauthorized", message);
}

export function sendConflict(reply: FastifyReply, message: string): Promise<void> {
  return sendError(reply, 409, "conflict", message);
}
