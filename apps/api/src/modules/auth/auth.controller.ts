import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { VerifyMfaLoginDto } from "./dto/verify-mfa-login.dto";
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

    if (result.mfaRequired) {
      return { mfaRequired: true, challengeToken: result.challengeToken };
    }
    if (result.sessionToken) {
      response.cookie(this.authService.getCookieName(), result.sessionToken, this.authService.getCookieOptions());
    }
    return { mfaRequired: false, user: result.user };
  }

  @Post("mfa/verify-login")
  @UseGuards(ThrottlerGuard)
  async verifyMfaLogin(@Body() body: VerifyMfaLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.verifyMfaLogin(body, {
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? null
    });

    response.cookie(this.authService.getCookieName(), result.sessionToken, this.authService.getCookieOptions());
    return { user: result.user };
  }

  @Post("forgot-password")
  @UseGuards(ThrottlerGuard)
  forgotPassword(@Body() body: ForgotPasswordDto, @Req() request: Request) {
    return this.authService.forgotPassword(body, {
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? null
    });
  }

  @Post("reset-password")
  @UseGuards(ThrottlerGuard)
  resetPassword(@Body() body: ResetPasswordDto, @Req() request: Request) {
    return this.authService.resetPassword(body, {
      ipAddress: request.ip,
      userAgent: request.header("user-agent") ?? null
    });
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
