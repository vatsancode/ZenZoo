import { EventEmitter } from "node:events";

/**
 * Minimal in-process event bus. Deliberately not Kafka/Redis/a message
 * queue - introduce one of those only when a real cross-process consumer
 * needs it (see README).
 */
export interface DomainEvent<Name extends string = string, Payload = unknown> {
  name: Name;
  payload: Payload;
  occurredAt: Date;
}

const emitter = new EventEmitter();

export function publish<Name extends string, Payload>(name: Name, payload: Payload): void {
  const event: DomainEvent<Name, Payload> = { name, payload, occurredAt: new Date() };
  emitter.emit(name, event);
}

export function subscribe<Name extends string, Payload>(
  name: Name,
  handler: (event: DomainEvent<Name, Payload>) => void,
): () => void {
  emitter.on(name, handler);
  return () => emitter.off(name, handler);
}
