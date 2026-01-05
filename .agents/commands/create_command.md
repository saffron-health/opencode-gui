---
name: create_command
description: Create a new development command template following established patterns and Claude 4 prompting best practices
input: Command name and purpose description
output: New command file created in commands/ directory with proper structure and optimized prompting
---

Create a new development command template in the commands/ directory. Follow these steps to ensure consistency and effectiveness.

## Design the command structure

Follow the established YAML frontmatter pattern:

```yaml
---
name: command_name
description: Clear, specific description of what the command does and achieves
input: What input the command expects from the user
output: What deliverable or outcome the command produces
---
```

## Apply Claude 4 prompting best practices

Reference the guidelines in [@docs/claude-4-prompting-guide.md](../docs/claude-4-prompting-guide.md) to write effective instructions:

### Be explicit and specific

- Clearly state exactly what behaviors you want the AI to exhibit
- Add context explaining why certain approaches are important for this workflow
- Include specific modifiers like "Include as many relevant features as possible" when comprehensive output is desired

### Use positive instruction framing

- Tell Claude what TO do instead of what NOT to do
- Frame instructions as clear action steps rather than restrictions

### Optimize for tool usage

- Include explicit guidance for parallel tool calling when multiple independent operations are needed
- Specify when to use `codebase_search_agent`, `todo_write`, `oracle`, and other tools
- Encourage systematic approach with quality checkpoints

### Structure for complex reasoning

- Break down multi-step processes into clear phases
- Include reflection points after tool usage: "After receiving tool results, carefully reflect on their quality and determine optimal next steps"
- Use the todo system for task management and progress tracking

## Write comprehensive instructions

Structure the command instructions with:

1. **Context setting**: Explain the command's purpose and how it fits into the development workflow
2. **Step-by-step process**: Clear, actionable steps following established patterns
3. **Quality assurance**: Include diagnostic checks and validation steps
4. **Tool usage guidance**: Specific instructions for when and how to use available tools
5. **Examples**: Reference similar existing commands or provide concrete examples where helpful

## Validate the command

Before finalizing:

- Ensure the command follows the exact format of existing commands
- Verify it references appropriate documentation and guidelines
- Check that it encourages best practices from the Claude 4 prompting guide
- Test that the instructions are clear and actionable

## Save and document

- Save the command as `{command_name}.md` in the commands/ directory
- Update the commands/AGENT.md file to include the new command in the examples section
- Follow the established documentation patterns for consistency
