/** Simple pub/sub event emitter using a Map of event name to callback arrays. */
class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  /**
   * Register a callback for an event.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(callback);
  }

  /**
   * Emit an event, calling all registered callbacks.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach((callback) => callback(data));
    }
  }

  /**
   * Remove a specific callback from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (this.events.has(event)) {
      const listeners = this.events.get(event).filter((cb) => cb !== callback);
      this.events.set(event, listeners);
    }
  }

  /** Remove all listeners for all events. */
  removeAllListeners() {
    this.events.clear();
  }
}

export default EventEmitter;
