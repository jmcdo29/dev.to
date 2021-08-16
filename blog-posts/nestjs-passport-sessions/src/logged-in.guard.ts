import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';


@Injectable()
export class LoggedInGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    return context.switchToHttp().getRequest().isAuthenticated();
  }
}
