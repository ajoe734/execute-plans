import type { Channel, McpSecret, McpServer, McpTool, Skill, Tool } from "./dto";
import { paths } from "./paths";
import {
  delaySeed,
  detailPath,
  liveItemsFrom,
  strictLiveDetailNormalized,
  strictLiveListNormalized,
  strictLiveRead,
} from "./domainReads";

export async function listTools(): Promise<Tool[]> {
  return strictLiveListNormalized("tools.list", paths.tools());
}

export async function getTool(id: string): Promise<Tool | undefined> {
  return strictLiveDetailNormalized("tools.get", detailPath(paths.tools(), id));
}

export async function listMcpServers(): Promise<McpServer[]> {
  return strictLiveListNormalized("mcpServers.list", paths.mcpServers());
}

export async function getMcpServer(id: string): Promise<McpServer | undefined> {
  return strictLiveDetailNormalized("mcpServers.get", detailPath(paths.mcpServers(), id));
}

export async function listMcpTools(): Promise<McpTool[]> {
  return strictLiveListNormalized("mcpTools.list", paths.mcpTools());
}

export async function getMcpTool(id: string): Promise<McpTool | undefined> {
  return strictLiveDetailNormalized("mcpTools.get", detailPath(paths.mcpTools(), id));
}

export async function listSkills(): Promise<Skill[]> {
  return strictLiveListNormalized("skills.list", paths.skills());
}

export async function getSkill(id: string): Promise<Skill | undefined> {
  return strictLiveDetailNormalized("skills.get", detailPath(paths.skills(), id));
}

export async function listChannels(): Promise<Channel[]> {
  return strictLiveListNormalized("channels.list", paths.channels());
}

export async function getChannel(id: string): Promise<Channel | undefined> {
  return strictLiveDetailNormalized("channels.get", detailPath(paths.channels(), id));
}

export async function getMcpSecretsForServer(serverId: string): Promise<McpSecret[]> {
  return delaySeed("bff.mcpSecrets.forServer", [{ serverId, secretKey: "api_key" }], []);
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

