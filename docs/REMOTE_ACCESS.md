# Remote Access

Remote access is modeled as an integration with external tools instead of custom screen sharing.

Supported provider placeholders:

- RustDesk
- MeshCentral
- Tactical RMM
- Manual
- Other

Remote access attempts require `remote_access.connect` and write audit logs. Future work should associate remote sessions with active tickets and generate provider-specific connection links.
