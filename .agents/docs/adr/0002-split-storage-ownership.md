# Split Storage Ownership

Better Agent will split storage ownership by responsibility: D1 stores product-level indexes and authorization metadata, Durable Object SQLite stores Thinkspace runtime-local state, and R2 stores large Sources and Artifacts. We are choosing this over one central database because Thinkspace Agent runtime state should stay colocated with the durable agent runtime, while product surfaces still need cheap cross-Thinkspace indexes and large files need blob storage.

Considered alternatives: storing all state in D1; storing nearly all state in Durable Objects; using an external database as the primary store. The consequence is a deliberate synchronization boundary: D1 indexes make product navigation possible, but the Thinkspace Agent runtime remains the owner of messages, memory changes, tool runs, approvals, and runtime-local state.
