Wrap up the current work session by committing changes, ensuring a PR exists, and providing a handoff summary for the next developer.

## Process

1. Check branch: If on main, checkout a new branch with descriptive name based on work done
2. Review conversation: Summarize what was worked on during this session
3. Check bead status: Run `bd list --json` to see which issues were touched
4. Commit changes: Create commit with descriptive message based on work done
5. Check for PR: Use `gh pr list --head <current-branch>` to see if PR exists
6. Create or update PR:
   - If no PR exists: Create one with `gh pr create` using appropriate title and description
   - If PR exists: Query current title/description with `gh pr view <number>`, update if needed with `gh pr edit`
7. Push changes: Push commits to remote branch
8. Generate handoff: Create summary containing:
   - What was accomplished this session
   - What was started but not finished
   - PR link and status
   - Key decisions and context from this session
   - Next steps with recommended approach
