# Wishline project instructions

Before changing the Steam connector, credential storage, deployment model,
privacy behavior, data retention, branding, or monetization, read
[`docs/STEAM-COMPLIANCE.md`](docs/STEAM-COMPLIANCE.md) in full.

Do not assume that a paid hosted SaaS may collect customers' Steamworks
Financial Web API keys. The public documentation does not give a conclusive
authorization for that model, and the key can access partner-wide financial
data. Paid production launch remains blocked until Valve confirms the proposed
integration in writing and the compliance launch gate in that document is met.

Keep the compliance note, roadmap, security policy, and implementation aligned
whenever a change affects that conclusion or its mitigations.
