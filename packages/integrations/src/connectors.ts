import { IntegrationType } from "@motoko/core";

export interface ConnectorConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export abstract class BaseConnector {
  constructor(
    public id: string,
    public type: IntegrationType,
    public config: ConnectorConfig
  ) {}
  
  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
}

export class GitHubConnector extends BaseConnector {
  constructor(config: ConnectorConfig) {
    super("github", "github", config);
  }
  
  async connect(): Promise<boolean> {
    console.log("Connecting to GitHub...");
    return true;
  }
  
  async disconnect(): Promise<void> {
    console.log("Disconnecting from GitHub...");
  }
}

export class SlackConnector extends BaseConnector {
  constructor(config: ConnectorConfig) {
    super("slack", "slack", config);
  }
  
  async connect(): Promise<boolean> {
    console.log("Connecting to Slack...");
    return true;
  }
  
  async disconnect(): Promise<void> {
    console.log("Disconnecting from Slack...");
  }
}
