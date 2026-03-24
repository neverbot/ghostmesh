export default class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(callback);
  }

  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach((callback) => callback(data));
    }
  }

  off(event, callback) {
    if (this.events.has(event)) {
      const listeners = this.events.get(event).filter((cb) => cb !== callback);
      this.events.set(event, listeners);
    }
  }

  removeAllListeners() {
    this.events.clear();
  }
}
