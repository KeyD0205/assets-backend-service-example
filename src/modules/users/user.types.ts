import type { Role } from '../../shared/roles.js';

export type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
};

export type PublicUser = Omit<User, 'tenant_id'>;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}
