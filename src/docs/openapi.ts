import { z } from "zod";
import { signupSchema, loginSchema, refreshSchema } from "../modules/auth/auth.schema.js";
import { addMemberSchema } from "../modules/tenants/tenants.schema.js";
import { createClientSchema, updateClientSchema, listQuerySchema } from "../modules/clients/clients.schema.js";
import { createProjectSchema, updateProjectSchema, listProjectsQuery } from "../modules/projects/projects.schema.js";
import { requestUploadSchema } from "../modules/document/documents.schema.js";
import { createInviteSchema, acceptInviteSchema } from "../modules/invites/invites.schema.js";

// ---------- helpers ----------
function stripPatterns(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(stripPatterns);
    if (node && typeof node === "object") {
        const obj = { ...(node as Record<string, unknown>) };
        if (obj.format && obj.pattern) delete obj.pattern;
        for (const key of Object.keys(obj)) obj[key] = stripPatterns(obj[key]);
        return obj;
    }
    return node;
}

// zod schema -> JSON Schema (what OpenAPI 3.1 understands)
function toSchema(schema: z.ZodType) {
    const { $schema, ...rest } = z.toJSONSchema(schema, {
        io: "input",
        unrepresentable: "any",
    });
    return stripPatterns(rest) as Record<string, unknown> & { properties?: Record<string, object> };
}


const body = (schema: z.ZodType) => ({
    required: true,
    content: { "application/json": { schema: toSchema(schema) } },
});

function queryParams(schema: z.ZodObject) {
    const props = (toSchema(schema).properties ?? {}) as Record<string, object>;
    return Object.entries(props).map(([name, s]) => ({ name, in: "query", schema: s }));
}

const pathParam = (name: string) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
});

const secured = [{ bearerAuth: [] }];

const err = (description: string) => ({
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const common = {
    "400": err("Validation error"),
    "401": err("Missing or invalid access token"),
    "403": err("Your role is not allowed"),
};

const tenant = pathParam("tenantId");

// ---------- spec ----------

export const openapiSpec = {
    openapi: "3.1.0",
    info: {
        title: "Klarbook API",
        version: "1.0.0",
        description:
            "GDPR-compliant multi-tenant client portal API for agencies. " +
            "Tenant data is isolated by tenantId checks and Postgres row-level security.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
        { name: "Auth" }, { name: "Tenants" }, { name: "Clients" }, { name: "Projects" },
        { name: "Documents" }, { name: "Invites" }, { name: "GDPR" }, { name: "Billing" },
    ],
    components: {
        securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
        schemas: {
            Error: {
                type: "object",
                properties: {
                    error: {
                        type: "object",
                        properties: {
                            code: { type: "string", example: "NOT_FOUND" },
                            message: { type: "string" },
                        },
                    },
                },
            },
        },
    },
    paths: {
        // ----- Auth -----
        "/auth/signup": {
            post: {
                tags: ["Auth"], summary: "Create an agency (tenant) and its OWNER",
                requestBody: body(signupSchema),
                responses: { "201": { description: "Tenant and owner created" }, "400": common["400"], "409": err("Email already exists"), "429": err("Too many attempts") },
            },
        },
        "/auth/login": {
            post: {
                tags: ["Auth"], summary: "Log in, get access token (15 min) and refresh token (30 days)",
                requestBody: body(loginSchema),
                responses: { "200": { description: "Tokens issued" }, "401": err("Wrong email or password"), "429": err("Too many attempts (10 per 15 min)") },
            },
        },
        "/auth/refresh": {
            post: {
                tags: ["Auth"], summary: "Rotate refresh token and get a new access token",
                requestBody: body(refreshSchema),
                responses: { "200": { description: "New token pair" }, "401": err("Refresh token invalid, expired or reused") },
            },
        },
        "/auth/logout": {
            post: {
                tags: ["Auth"], summary: "Revoke a refresh token",
                requestBody: body(refreshSchema),
                responses: { "204": { description: "Logged out" } },
            },
        },
        "/auth/me": {
            get: {
                tags: ["Auth"], summary: "Current user and their memberships", security: secured,
                responses: { "200": { description: "Current user" }, "401": common["401"] },
            },
        },

        // ----- Tenants -----
        "/tenants/{tenantId}": {
            get: {
                tags: ["Tenants"], summary: "View the agency (any member)", security: secured, parameters: [tenant],
                responses: { "200": { description: "Tenant and your role" }, "401": common["401"], "403": common["403"] },
            },
        },
        "/tenants/{tenantId}/members": {
            get: {
                tags: ["Tenants"], summary: "List members (OWNER, ADMIN)", security: secured, parameters: [tenant],
                responses: { "200": { description: "Members" }, ...common },
            },
            post: {
                tags: ["Tenants"], summary: "Add an existing user as member (OWNER, ADMIN)", security: secured, parameters: [tenant],
                requestBody: body(addMemberSchema),
                responses: { "201": { description: "Member added" }, ...common, "409": err("Already a member") },
            },
        },

        // ----- Clients -----
        "/tenants/{tenantId}/clients": {
            get: {
                tags: ["Clients"], summary: "List clients (cursor pagination)", security: secured,
                parameters: [tenant, ...queryParams(listQuerySchema)],
                responses: { "200": { description: "Page of clients with nextCursor" }, ...common },
            },
            post: {
                tags: ["Clients"], summary: "Create a client", security: secured, parameters: [tenant],
                requestBody: body(createClientSchema),
                responses: { "201": { description: "Client created" }, ...common },
            },
        },
        "/tenants/{tenantId}/clients/{clientId}": {
            get: {
                tags: ["Clients"], summary: "Get one client", security: secured, parameters: [tenant, pathParam("clientId")],
                responses: { "200": { description: "Client" }, ...common, "404": err("Not found") },
            },
            patch: {
                tags: ["Clients"], summary: "Update a client", security: secured, parameters: [tenant, pathParam("clientId")],
                requestBody: body(updateClientSchema),
                responses: { "200": { description: "Updated client" }, ...common, "404": err("Not found") },
            },
            delete: {
                tags: ["Clients"], summary: "Soft-delete a client (OWNER, ADMIN)", security: secured, parameters: [tenant, pathParam("clientId")],
                responses: { "204": { description: "Deleted" }, ...common, "404": err("Not found") },
            },
        },

        // ----- Projects -----
        "/tenants/{tenantId}/projects": {
            get: {
                tags: ["Projects"], summary: "List projects (filter by status or client)", security: secured,
                parameters: [tenant, ...queryParams(listProjectsQuery)],
                responses: { "200": { description: "Page of projects with nextCursor" }, ...common },
            },
            post: {
                tags: ["Projects"], summary: "Create a project for a client", security: secured, parameters: [tenant],
                requestBody: body(createProjectSchema),
                responses: { "201": { description: "Project created" }, ...common, "404": err("Client not found") },
            },
        },
        "/tenants/{tenantId}/projects/{projectId}": {
            get: {
                tags: ["Projects"], summary: "Get one project", security: secured, parameters: [tenant, pathParam("projectId")],
                responses: { "200": { description: "Project" }, ...common, "404": err("Not found") },
            },
            patch: {
                tags: ["Projects"], summary: "Update a project", security: secured, parameters: [tenant, pathParam("projectId")],
                requestBody: body(updateProjectSchema),
                responses: { "200": { description: "Updated project" }, ...common, "404": err("Not found") },
            },
            delete: {
                tags: ["Projects"], summary: "Soft-delete a project (OWNER, ADMIN)", security: secured, parameters: [tenant, pathParam("projectId")],
                responses: { "204": { description: "Deleted" }, ...common, "404": err("Not found") },
            },
        },

        // ----- Documents -----
        "/tenants/{tenantId}/projects/{projectId}/documents": {
            get: {
                tags: ["Documents"], summary: "List READY documents of a project", security: secured,
                parameters: [tenant, pathParam("projectId")],
                responses: { "200": { description: "Documents" }, ...common },
            },
        },
        "/tenants/{tenantId}/projects/{projectId}/documents/upload-url": {
            post: {
                tags: ["Documents"], summary: "Step 1: get a presigned S3 upload URL (document is PENDING)", security: secured,
                parameters: [tenant, pathParam("projectId")],
                requestBody: body(requestUploadSchema),
                responses: { "201": { description: "Document id and uploadUrl" }, ...common, "404": err("Project not found") },
            },
        },
        "/tenants/{tenantId}/projects/{projectId}/documents/{documentId}/confirm": {
            post: {
                tags: ["Documents"], summary: "Step 2: confirm upload finished (document becomes READY)", security: secured,
                parameters: [tenant, pathParam("projectId"), pathParam("documentId")],
                responses: { "200": { description: "Document READY" }, ...common, "404": err("Not found") },
            },
        },
        "/tenants/{tenantId}/projects/{projectId}/documents/{documentId}/download-url": {
            get: {
                tags: ["Documents"], summary: "Get a short-lived presigned download URL", security: secured,
                parameters: [tenant, pathParam("projectId"), pathParam("documentId")],
                responses: { "200": { description: "downloadUrl" }, ...common, "404": err("Not found") },
            },
        },

        // ----- Invites -----
        "/tenants/{tenantId}/invites": {
            post: {
                tags: ["Invites"], summary: "Invite someone by email (OWNER, ADMIN). Email is sent by a background job.", security: secured,
                parameters: [tenant],
                requestBody: body(createInviteSchema),
                responses: { "201": { description: "Invite created" }, ...common, "409": err("Already a member or invited") },
            },
        },
        "/invites/accept": {
            post: {
                tags: ["Invites"], summary: "Accept an invite with the token from the email (public)",
                requestBody: body(acceptInviteSchema),
                responses: { "200": { description: "Account and membership created" }, "400": err("Invalid or expired token") },
            },
        },

        // ----- GDPR -----
        "/me/export": {
            get: {
                tags: ["GDPR"], summary: "Download all your personal data as JSON (Art. 15/20)", security: secured,
                responses: { "200": { description: "klarbook-export.json" }, "401": common["401"] },
            },
        },
        "/me": {
            delete: {
                tags: ["GDPR"], summary: "Erase your account by anonymizing it (Art. 17)", security: secured,
                responses: { "204": { description: "Erased" }, "401": common["401"], "409": err("OWNERs must transfer ownership first") },
            },
        },

        // ----- Billing -----
        "/tenants/{tenantId}/billing/checkout": {
            post: {
                tags: ["Billing"], summary: "Start Stripe Checkout for Klarbook Pro (OWNER only)", security: secured,
                parameters: [tenant],
                responses: { "201": { description: "Checkout url" }, "401": common["401"], "403": common["403"], "409": err("Already on PRO") },
            },
        },
        "/billing/webhook": {
            post: {
                tags: ["Billing"], summary: "Stripe webhook. Called by Stripe, verified by signature, not by JWT.",
                parameters: [{ name: "stripe-signature", in: "header", required: true, schema: { type: "string" } }],
                responses: { "200": { description: "Event received" }, "400": err("Missing or invalid signature") },
            },
        },
    },
};