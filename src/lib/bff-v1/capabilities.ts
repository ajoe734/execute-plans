import * as seed from "@/mocks/seed";
import type { Channel, McpSecret, McpServer, McpTool, Skill, Tool } from "./dto";
import { paths } from "./paths";
import {
  delaySeed,
  detailPath,
  liveDetailOrSeedNormalized,
  liveListOrSeedNormalized,
} from "./domainReads";

export async function listTools(): Promise<Tool[]> {
  return liveListOrSeedNormalized("tools.list", paths.tools(), seed.tools);
}

export async function getTool(id: string): Promise<Tool | undefined> {
  return liveDetailOrSeedNormalized("tools.get", detailPath(paths.tools(), id), seed.tools.find((t) => t.id === id));
}

export async function listMcpServers(): Promise<McpServer[]> {
  return liveListOrSeedNormalized("mcpServers.list", paths.mcpServers(), seed.mcpServers);
}

export async function getMcpServer(id: string): Promise<McpServer | undefined> {
  return liveDetailOrSeedNormalized("mcpServers.get", detailPath(paths.mcpServers(), id), seed.mcpServers.find((s) => s.id === id));
}

export async function listMcpTools(): Promise<McpTool[]> {
  return liveListOrSeedNormalized("mcpTools.list", paths.mcpTools(), seed.mcpTools);
}

export async function getMcpTool(id: string): Promise<McpTool | undefined> {
  return liveDetailOrSeedNormalized("mcpTools.get", detailPath(paths.mcpTools(), id), seed.mcpTools.find((t) => t.id === id));
}

export async function listSkills(): Promise<Skill[]> {
  return liveListOrSeedNormalized("skills.list", paths.skills(), seed.skills);
}

export async function getSkill(id: string): Promise<Skill | undefined> {
  return liveDetailOrSeedNormalized("skills.get", detailPath(paths.skills(), id), seed.skills.find((s) => s.id === id));
}

export async function listChannels(): Promise<Channel[]> {
  return liveListOrSeedNormalized("channels.list", paths.channels(), seed.channels);
}

export async function getChannel(id: string): Promise<Channel | undefined> {
  return liveDetailOrSeedNormalized("channels.get", detailPath(paths.channels(), id), seed.channels.find((c) => c.id === id));
}

export async function getMcpSecretsForServer(serverId: string): Promise<McpSecret[]> {
  return delaySeed("mcpSecrets.forServer", seed.mcpSecrets.filter((s) => s.serverId === serverId), []);
}

export const tools = {
  list: listTools,
  get: getTool,
};

export const mcpServers = {
  list: listMcpServers,
  get: getMcpServer,
};

export const mcpTools = {
  list: listMcpTools,
  get: getMcpTool,
};

export const skills = {
  list: listSkills,
  get: getSkill,
};

export const channels = {
  list: listChannels,
  get: getChannel,
};

export const mcpSecrets = {
  forServer: getMcpSecretsForServer,
};
