export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export class WebhookHandler {
  private endpoints: Map<string, string> = new Map();
  
  register(integrationId: string, endpoint: string): void {
    this.endpoints.set(integrationId, endpoint);
  }
  
  async send(integrationId: string, payload: WebhookPayload): Promise<void> {
    const endpoint = this.endpoints.get(integrationId);
    if (!endpoint) {
      throw new Error(`No endpoint registered for ${integrationId}`);
    }
    
    console.log(`Sending webhook to ${endpoint}`, payload);
  }
  
  async broadcast(payload: WebhookPayload): Promise<void> {
    for (const [id, endpoint] of this.endpoints) {
      console.log(`Broadcasting to ${id} at ${endpoint}`);
    }
  }
}
