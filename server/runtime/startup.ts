export interface StartupReadinessInput {
  modeValidation: { valid: boolean; reason?: string };
  production: boolean;
  productionIndexExists: boolean;
}

export function startupReadiness(input: StartupReadinessInput): { valid: boolean; reason?: string } {
  if (!input.modeValidation.valid) {
    return {
      valid: false,
      reason: input.modeValidation.reason || 'Execution mode configuration is invalid',
    };
  }
  if (input.production && !input.productionIndexExists) {
    return {
      valid: false,
      reason: 'Production frontend assets are missing. Run npm run build before npm start.',
    };
  }
  return { valid: true };
}
