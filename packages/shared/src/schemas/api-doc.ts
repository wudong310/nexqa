import { z } from "zod";

export const ParamSchema = z.object({
  name: z.string(),
  type: z.string().default("string"),
  required: z.boolean().default(false),
  description: z.string().default(""),
  example: z.unknown().optional(),
});
export type Param = z.infer<typeof ParamSchema>;

export const EndpointResponseSchema = z.object({
  status: z.number(),
  description: z.string().default(""),
  example: z.unknown().optional(),
});
export type EndpointResponse = z.infer<typeof EndpointResponseSchema>;

export const EndpointSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  path: z.string(),
  summary: z.string().default(""),
  headers: z.array(ParamSchema).default([]),
  queryParams: z.array(ParamSchema).default([]),
  pathParams: z.array(ParamSchema).default([]),
  body: z
    .object({
      contentType: z.string().default("application/json"),
      schema: z.unknown().optional(),
      example: z.unknown().optional(),
    })
    .optional(),
  responses: z.array(EndpointResponseSchema).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const ApiEndpointSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  documentId: z.string().uuid().nullable().default(null),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  path: z.string(),
  summary: z.string().default(""),
  headers: z.array(ParamSchema).default([]),
  queryParams: z.array(ParamSchema).default([]),
  pathParams: z.array(ParamSchema).default([]),
  body: z
    .object({
      contentType: z.string().default("application/json"),
      schema: z.unknown().optional(),
      example: z.unknown().optional(),
    })
    .optional(),
  responses: z.array(EndpointResponseSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;
