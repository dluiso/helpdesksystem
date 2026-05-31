import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedRequest, AuthenticatedUser } from "./auth.types";
import { SessionAuthGuard } from "./guards/session-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @UseGuards(ThrottlerGuard)
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(body, {
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? null
    });

    response.cookie(this.authService.getCookieName(), result.sessionToken, this.authService.getCookieOptions());
    return { user: result.user };
  }

  @Post("logout")
  @UseGuards(SessionAuthGuard)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(request.sessionToken, {
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? null
    });

    response.clearCookie(this.authService.getCookieName(), this.authService.getClearCookieOptions());
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
