import { Squad, Agent } from "@motoko/core";

export interface SquadManager {
  createSquad(name: string, agentIds: string[]): Promise<Squad>;
  addAgentToSquad(squadId: string, agentId: string): Promise<void>;
  removeAgentFromSquad(squadId: string, agentId: string): Promise<void>;
  getSquadMemory(squadId: string): Promise<string[]>;
}

export interface SquadRuntime {
  squad: Squad;
  broadcastMessage(message: string, fromAgentId: string): Promise<void>;
  shareMemory(content: string, fromAgentId: string): Promise<void>;
}

export class SquadManagerImpl implements SquadManager {
  private squads = new Map<string, Squad>();
  private squadMemories = new Map<string, string[]>();

  async createSquad(name: string, agentIds: string[]): Promise<Squad> {
    const squad: Squad = {
      id: `squad-${Date.now()}`,
      name,
      color: this.generateColor(name),
      agentIds,
      sharedMemory: { contextWindow: [], documents: [], preferences: {} },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.squads.set(squad.id, squad);
    this.squadMemories.set(squad.id, []);

    console.log(`[SquadManager] Created squad ${squad.id}: ${name}`);
    return squad;
  }

  async addAgentToSquad(squadId: string, agentId: string): Promise<void> {
    const squad = this.squads.get(squadId);
    if (!squad) {
      throw new Error(`Squad not found: ${squadId}`);
    }

    if (!squad.agentIds.includes(agentId)) {
      squad.agentIds.push(agentId);
      squad.updatedAt = Date.now();
      console.log(`[SquadManager] Added agent ${agentId} to squad ${squadId}`);
    }
  }

  async removeAgentFromSquad(squadId: string, agentId: string): Promise<void> {
    const squad = this.squads.get(squadId);
    if (!squad) {
      throw new Error(`Squad not found: ${squadId}`);
    }

    squad.agentIds = squad.agentIds.filter((id) => id !== agentId);
    squad.updatedAt = Date.now();
    console.log(`[SquadManager] Removed agent ${agentId} from squad ${squadId}`);
  }

  async getSquadMemory(squadId: string): Promise<string[]> {
    return this.squadMemories.get(squadId) || [];
  }

  async addToSquadMemory(squadId: string, content: string): Promise<void> {
    const memory = this.squadMemories.get(squadId);
    if (memory) {
      memory.push(content);
      // Keep only last 100 memories
      if (memory.length > 100) {
        memory.shift();
      }
    }
  }

  getSquad(squadId: string): Squad | undefined {
    return this.squads.get(squadId);
  }

  listSquads(): Squad[] {
    return Array.from(this.squads.values());
  }

  private generateColor(name: string): string {
    // Generate a consistent color based on the squad name
    const colors = [
      "#3b82f6", // blue
      "#10b981", // emerald
      "#f59e0b", // amber
      "#ef4444", // red
      "#8b5cf6", // violet
      "#ec4899", // pink
      "#06b6d4", // cyan
      "#84cc16", // lime
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }
}

export class SquadRuntimeImpl implements SquadRuntime {
  constructor(
    public squad: Squad,
    private agentTransports: Map<string, { sendMessage: (msg: string) => Promise<void> }>
  ) {}

  async broadcastMessage(message: string, fromAgentId: string): Promise<void> {
    const timestamp = Date.now();
    const formattedMessage = `[${new Date(timestamp).toISOString()}] ${fromAgentId}: ${message}`;

    // Add to shared memory
    this.squad.sharedMemory.contextWindow.push(formattedMessage);
    if (this.squad.sharedMemory.contextWindow.length > 50) {
      this.squad.sharedMemory.contextWindow.shift();
    }

    // Broadcast to all agents in squad except sender
    const broadcastPromises = this.squad.agentIds
      .filter((agentId) => agentId !== fromAgentId)
      .map(async (agentId) => {
        const transport = this.agentTransports.get(agentId);
        if (transport) {
          try {
            await transport.sendMessage(
              `[SQUAD:${this.squad.name}] ${message}`
            );
          } catch (error) {
            console.error(`[SquadRuntime] Failed to send to ${agentId}:`, error);
          }
        }
      });

    await Promise.all(broadcastPromises);
  }

  async shareMemory(content: string, fromAgentId: string): Promise<void> {
    const memoryEntry = `[${fromAgentId}] ${content}`;
    this.squad.sharedMemory.contextWindow.push(memoryEntry);
    
    // Keep context window manageable
    if (this.squad.sharedMemory.contextWindow.length > 100) {
      this.squad.sharedMemory.contextWindow = this.squad.sharedMemory.contextWindow.slice(-50);
    }

    console.log(`[SquadRuntime] Memory shared in ${this.squad.name} by ${fromAgentId}`);
  }
}
