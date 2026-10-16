-- Turn RLS on for the tenant-scoped tables
ALTER TABLE "Client"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;

-- One policy per table: only rows of the current tenant
CREATE POLICY tenant_isolation ON "Client"
  USING ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON "Project"
  USING ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation ON "Document"
  USING ("tenantId" = current_setting('app.tenant_id', true));