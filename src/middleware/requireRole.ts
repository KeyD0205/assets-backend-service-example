import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../shared/errors.js';
import { hasContext } from '../shared/request-context-helpers.js';
import type { Role } from '../shared/roles.js';

const roleRank: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3
};

export function requireMinimumRole(minimumRole: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!hasContext(req)) throw unauthorized();
    if (roleRank[req.ctx.role] < roleRank[minimumRole]) {
      throw forbidden();
    }
    next();
  };
}
