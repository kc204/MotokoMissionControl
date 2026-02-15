export interface TelemetryEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export class Telemetry {
  private events: TelemetryEvent[] = [];
  
  track(type: string, data: Record<string, unknown>): void {
    this.events.push({
      id: `event-${Date.now()}`,
      type,
      data,
      timestamp: Date.now()
    });
  }
  
  getEvents(type?: string): TelemetryEvent[] {
    return type ? this.events.filter(e => e.type === type) : this.events;
  }
}
