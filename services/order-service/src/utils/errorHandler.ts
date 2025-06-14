type ErrorDetails = Record<string, unknown>;

export const createError = (status: number, code: string, message: string, details?: ErrorDetails) => ({
  status,
  code,
  message,
  details,
});
