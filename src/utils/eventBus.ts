import type { EventMap } from './eventMap.ts';

/**
 * EventBus - A singleton class that implements the publish/subscribe pattern
 * Allows components to communicate with each other through events
 */
class EventBus {
    private static instance: EventBus;
    private subscribers!: Map<string, Set<Function>>;

    constructor() {
        if (EventBus.instance) {
            return EventBus.instance;
        }
        EventBus.instance = this;
        this.subscribers = new Map();
    }

    subscribe<K extends keyof EventMap>(event: K, callback: (data: EventMap[K]) => void): () => void {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, new Set());
        }
        this.subscribers.get(event)!.add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.subscribers.get(event);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.subscribers.delete(event);
                }
            }
        };
    }

    publish<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
        const callbacks = this.subscribers.get(event);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    (callback as (data: EventMap[K]) => void)(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            }
        }
    }

    clearEvent<K extends keyof EventMap>(event: K): void {
        this.subscribers.delete(event);
    }

    clearAll(): void {
        this.subscribers.clear();
    }
}

// Create and export a singleton instance
const eventBus = new EventBus();
export default eventBus;
