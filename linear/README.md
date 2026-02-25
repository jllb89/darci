# Linear Mapping Prep

Use issue_key as the source of truth to map GitHub issues to Linear.

## Suggested Process
1. Create GitHub labels and milestones.
2. Create GitHub issues from ISSUES.md.
3. Export created GitHub issue numbers into issue-mapping.csv.
4. Add Linear metadata: team, project, status, priority, and linear_issue_id.

## Columns
- issue_key: Stable key from ISSUES.md
- issue_title: Issue title
- week: 1-6
- labels: Comma-separated label list
- milestone: Week N
- linear_team: Linear team name
- linear_project: Linear project name
- linear_status: Linear state
- linear_priority: Linear priority (P0-P3)
- linear_issue_id: Linear issue identifier
