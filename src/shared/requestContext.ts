import type { Role } from './roles.js';

export type RequestContext = {
  requestId: string;
  userId: string;
  tenantId: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ctx?: RequestContext;
    }
  }
}
