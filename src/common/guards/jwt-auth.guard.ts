import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector?: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        const request = context.switchToHttp().getRequest();
        const authHeader = request?.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const result = await super.canActivate(context);
            return typeof result === 'boolean' ? result : true;
          } catch {
            return true;
          }
        }
        return true;
      }
    }
    const result = await super.canActivate(context);
    return typeof result === 'boolean' ? result : true;
  }

  handleRequest(err: any, user: any, info: any, context?: ExecutionContext) {
    if (this.reflector && context) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return user || null;
      }
    }
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Authentication token is missing, invalid, or expired. Please provide a valid Bearer token.',
        )
      );
    }
    return user;
  }
}
