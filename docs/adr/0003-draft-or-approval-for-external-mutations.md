# Draft Or Approval For External Mutations

Better Agent will default external mutations to drafts or explicit Approvals, even when a Thinkspace has a Permission for the relevant resource and action. A Permission defines what may be allowed within a Thinkspace; an Approval consents to a proposed action or narrow standing policy within that Permission.

We are choosing this over treating Permission as immediate execution authority because Better Agent should help users act responsibly rather than create automated pest behavior, spam, or broad blast-radius failures. The consequence is slower external action by default, in exchange for clearer user intent, safer connected-account behavior, and an audit trail that distinguishes allowed capabilities from approved actions.
