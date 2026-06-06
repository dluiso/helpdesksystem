import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ConfirmMfaSetupDto, DisableMfaDto, StartMfaSetupDto } from "./dto/mfa.dto";
import { UpdateProfileSignatureDto } from "./dto/update-profile-signature.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getProfile(user);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileDto) {
    return this.profileService.updateProfile(user, input);
  }

  @Patch("password")
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangePasswordDto) {
    return this.profileService.changePassword(user, input);
  }

  @Post("mfa/setup")
  startMfaSetup(@CurrentUser() user: AuthenticatedUser, @Body() input: StartMfaSetupDto) {
    return this.profileService.startMfaSetup(user, input);
  }

  @Post("mfa/confirm")
  confirmMfaSetup(@CurrentUser() user: AuthenticatedUser, @Body() input: ConfirmMfaSetupDto) {
    return this.profileService.confirmMfaSetup(user, input);
  }

  @Post("mfa/disable")
  disableMfa(@CurrentUser() user: AuthenticatedUser, @Body() input: DisableMfaDto) {
    return this.profileService.disableMfa(user, input);
  }

  @Get("signature")
  signature(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.signature(user);
  }

  @Patch("signature")
  updateSignature(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileSignatureDto) {
    return this.profileService.updateSignature(user, input);
  }
}
