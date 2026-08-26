import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Access denied: Authentication required.');
    }

    const userRole = (user.role || '').toString().toLowerCase();

    const hasRole = requiredRoles.some((role) => {
      const r = role.toString().toLowerCase();
      if (r === 'user' || r === 'customer') {
        return userRole === 'user' || userRole === 'customer';
      }
      return userRole === r;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: Required role (${requiredRoles.join(', ')}) not met. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
