# InfraPulse — Known Limitations & Operational Boundaries

**Phase 20 Release Engineering Deliverable**  
**Document Version**: 2.4.0  

---

## 1. Architectural & Operational Boundaries

1. **Local Git Workspace Tracking**:
   - The primary development directory (`D:\Projects\InfraPulse`) is currently an untracked local repository without `.git` initialization. In production releases, this is synced and packaged into Git version control and release tags.
2. **Remediation Sandboxing by Default**:
   - Remediation runbooks run in simulated mode by default (`simulationAdapter`). Integration with live cloud orchestrators (e.g., AWS SDK, Kubernetes Cluster API) requires explicit cluster service account bindings and out-of-band enablement to guarantee zero accidental production mutations.
3. **AI Assistant Grounded Fallback**:
   - When external LLM APIs (Gemini, OpenAI) experience rate limiting or network latency breaches, the assistant automatically falls back to deterministic RCA summaries and explicitly marks uncertainties. The assistant does not generate speculative hypotheses beyond verified database evidence.
4. **Single-Tenant Database per Schema**:
   - While `tenant_id` column partitioning exists across tables, tenant isolation is logical rather than physical schema-per-tenant. High-compliance multi-tenant deployments should isolate databases at the cluster level.
5. **Ingestion Request Sizing**:
   - The Express body parser enforces a strict `2MB` ceiling per incoming HTTP request. Webhooks containing commit histories larger than 2MB should be chunked or ingested via pagination.

