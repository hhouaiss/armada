import { AgentTool, ToolContext, ToolResult } from '../types/operations.js';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
    console.log(`✓ Registered tool: ${tool.name} (${tool.category})`);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  async execute(
    toolName: string,
    params: any,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolName} not found`,
      };
    }

    // Validate params if validation is defined
    if (tool.validate) {
      const validation = tool.validate(params);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors?.join(', ')}`,
        };
      }
    }

    try {
      console.log(`→ Executing tool: ${toolName}`, params);
      const result = await tool.execute(params, context);
      console.log(`✓ Tool completed: ${toolName}`);
      return result;
    } catch (error) {
      console.error(`✗ Tool failed: ${toolName}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  listByCategory(category: string): AgentTool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category
    );
  }

  listAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }
}
