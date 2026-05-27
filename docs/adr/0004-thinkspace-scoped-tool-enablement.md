# Thinkspace-Scoped Tool Enablement

Better Agent may support product-level catalogs for MCP servers, built-in tools, Connected Accounts, Local Nodes, and Skills, but nothing from those catalogs is exposed to a Thinkspace Agent by default. Each Thinkspace Agent receives only the tools and Skills explicitly enabled for its Goal, governed by Permissions and Approval policies where relevant.

We are choosing this over global auto-inheritance because scoped tool enablement improves safety and reduces context bloat from tools unrelated to the Thinkspace Goal. The consequence is more setup work during coordination and tool editing, in exchange for clearer agent scope, smaller prompts, and lower risk from accidental or irrelevant tool availability.
