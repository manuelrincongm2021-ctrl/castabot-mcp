import * as z from 'zod/v4';

export const ASSISTANT_BRIDGE_VERSION = '1.0.0';

export const AssistantHandshakeInputSchema = z.object({
  app: z.literal('BASCULAYPENSION'),
  app_version: z.string().trim().min(1).max(80),
  installation_id: z.string().trim().min(3).max(180),
  device_label: z.string().trim().max(180).optional(),
  mode: z.literal('READ_ONLY'),
  requested_capabilities: z.array(
    z.enum(['CONTEXT_V1', 'T03_V1', 'HEALTH_V1'])
  ).max(20).optional().default([])
});

export const AssistantContextSchema = z.object({
  module: z.enum([
    'PENSION_ENTRY',
    'PENSION_EXIT',
    'PENSION_HISTORY',
    'ROLLCALL',
    'PENSION_SHIFT_CUT',
    'SCALE',
    'SCALE_HISTORY',
    'SCALE_SHIFT_CUT',
    'GENERAL_CLOSE',
    'HOME',
    'OTHER'
  ]),
  screen: z.string().trim().max(120).optional(),
  user_role: z.enum(['ADMINISTRADOR', 'SUPERVISION', 'ENCARGADO_DE_TURNO']).optional(),
  shift: z.enum(['MANANA', 'TARDE', 'NOCHE']).optional(),
  tractor_plate: z.string().trim().max(40).optional(),
  economic_number: z.string().trim().max(80).optional(),
  company: z.string().trim().max(180).optional(),
  folio: z.string().trim().max(80).optional()
}).strict();

export type AssistantHandshakeInput = z.infer<typeof AssistantHandshakeInputSchema>;
export type AssistantContext = z.infer<typeof AssistantContextSchema>;

export function supportedAssistantCapabilities(t03Enabled: boolean): string[] {
  return t03Enabled
    ? ['HEALTH_V1', 'CONTEXT_V1', 'T03_V1']
    : ['HEALTH_V1', 'CONTEXT_V1'];
}
