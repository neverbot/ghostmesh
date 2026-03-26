type EventCallback = (...args: unknown[]) => void;

/** Simple pub/sub event emitter using a Map of event name to callback arrays. */
class EventEmitter {
  private events: Map<string, EventCallback[]>;

  constructor() {
    this.events = new Map();
  }

  /** Register a callback for an event. */
  on(event: string, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(callback);
  }

  /** Emit an event, calling all registered callbacks. */
  emit(event: string, data?: unknown): void {
    if (this.events.has(event)) {
      this.events.get(event)!.forEach((callback) => callback(data));
    }
  }

  /** Remove a specific callback from an event. */
  off(event: string, callback: EventCallback): void {
    if (this.events.has(event)) {
      const listeners = this.events.get(event)!.filter((cb) => cb !== callback);
      this.events.set(event, listeners);
    }
  }

  /** Remove all listeners for all events. */
  removeAllListeners(): void {
    this.events.clear();
  }
}

export default EventEmitter;
