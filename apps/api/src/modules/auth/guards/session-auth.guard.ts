import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { AuthenticatedRequest } from "../auth.types";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.authService.getCookieName();
    const sessionToken = request.cookies?.[cookieName] as string | undefined;
    const user = await this.authService.validateSessionToken(sessionToken);

    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }

    request.user = user;
    request.sessionToken = sessionToken;
    return true;
  }
}
